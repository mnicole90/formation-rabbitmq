#!/usr/bin/env node
/**
 * Service Validation — Verifie la coherence des donnees de capteurs.
 *
 * Ce service consomme les messages AMQP depuis l'exchange amq.topic (binding maison.#),
 * verifie que les valeurs sont dans les plages acceptables, puis :
 * - Si valide : republier sur l'exchange "validated" avec la meme routing key
 * - Si invalide : rejeter le message (nack, sans requeue)
 *
 * Utilise le manual ack pour garantir le traitement de chaque message.
 */

const amqplib = require("amqplib");

// Configuration AMQP
const AMQP_URL = "amqp://guest:guest@localhost:5672";

// Plages valides pour chaque type de capteur
const PLAGES_VALIDES = {
  temperature: { min: -20, max: 60 },
  humidite: { min: 0, max: 100 },
  fumee: { min: 0, max: 100 },
};

/**
 * Valide les donnees d'un capteur.
 * Retourne { valide: true } ou { valide: false, raison: "..." }
 */
function validerMessage(donnees) {
  const typeCapteur = donnees.sensor;
  const valeur = donnees.value;

  if (typeCapteur === "mouvement") {
    if (typeof valeur === "boolean") {
      return { valide: true };
    }
    return { valide: false, raison: `doit etre un booleen, recu: ${valeur}` };
  }

  const plage = PLAGES_VALIDES[typeCapteur];
  if (plage) {
    if (valeur >= plage.min && valeur <= plage.max) {
      return { valide: true };
    }
    return { valide: false, raison: `hors plage ${plage.min} a ${plage.max}` };
  }

  return { valide: false, raison: `type de capteur inconnu: ${typeCapteur}` };
}

/**
 * Connexion AMQP avec logique de retry (10 tentatives, 2s entre chaque).
 */
async function connecterAMQP() {
  for (let tentative = 1; tentative <= 10; tentative++) {
    try {
      const connexion = await amqplib.connect(AMQP_URL);
      console.log("[AMQP] Connecte a localhost");
      return connexion;
    } catch (err) {
      console.log(`[AMQP] Tentative ${tentative}/10 echouee : ${err.message}`);
      if (tentative < 10) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw new Error("Connexion AMQP impossible apres 10 tentatives");
}

async function main() {
  const connexion = await connecterAMQP();
  const canal = await connexion.createChannel();

  // Declarer l'exchange "validated" de type topic
  await canal.assertExchange("validated", "topic", { durable: false });

  // Declarer une queue auto-generee et la lier a amq.topic
  const { queue: nomQueue } = await canal.assertQueue("", { exclusive: true });
  await canal.bindQueue(nomQueue, "amq.topic", "maison.#");

  console.log("[AMQP] Service Validation demarre. En attente de messages...");
  console.log("[AMQP] Binding : amq.topic -> maison.#");
  console.log();

  // Consommer les messages avec manual ack
  canal.consume(nomQueue, (msg) => {
    if (!msg) return;

    let donnees;
    try {
      donnees = JSON.parse(msg.content.toString());
    } catch (err) {
      console.log(`[INVALIDE] Message non-JSON recu: ${msg.content.toString()}`);
      canal.nack(msg, false, false); // nack sans requeue
      return;
    }

    const typeCapteur = donnees.sensor || "inconnu";
    const piece = donnees.room || "inconnue";
    const valeur = donnees.value;

    // Valider les donnees
    const resultat = validerMessage(donnees);

    if (resultat.valide) {
      // Republier sur l'exchange "validated" avec la meme routing key
      canal.publish("validated", msg.fields.routingKey, msg.content);
      console.log(`[VALIDE]   ${typeCapteur} ${piece}: ${valeur}`);
      canal.ack(msg);
    } else {
      // Rejeter le message sans requeue
      let unite = "";
      if (typeCapteur === "temperature") unite = "°C";
      else if (typeCapteur === "humidite") unite = "%";

      console.log(`[INVALIDE] ${typeCapteur} ${piece}: ${valeur}${unite} (${resultat.raison})`);
      canal.nack(msg, false, false);
    }
  }, { noAck: false });

  // Gestion de l'arret propre
  process.on("SIGINT", async () => {
    console.log("\n[AMQP] Arret du service Validation.");
    await canal.close();
    await connexion.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`[ERREUR] ${err.message}`);
  process.exit(1);
});
