#!/usr/bin/env node
/**
 * Service Alertes — Detecte les seuils critiques dans les donnees validees.
 *
 * Ce service consomme les messages depuis l'exchange "validated" (binding maison.#)
 * et affiche des alertes formatees selon les seuils definis :
 * - Temperature > 50°C -> CRITICAL
 * - Temperature > 35°C -> WARNING
 * - Fumee > 70 -> CRITICAL
 * - Fumee > 40 -> WARNING
 * - Mouvement = true -> INFO
 * - Humidite -> pas d'alerte
 *
 * Utilise le manual ack pour garantir le traitement de chaque message.
 */

const amqplib = require("amqplib");

// Configuration AMQP
const AMQP_URL = "amqp://guest:guest@localhost:5672";

/**
 * Detecte le niveau d'alerte en fonction du type de capteur et de la valeur.
 * Retourne { niveau, message } ou null si pas d'alerte.
 */
function detecterAlerte(donnees) {
  const typeCapteur = donnees.sensor;
  const valeur = donnees.value;
  const piece = donnees.room || "inconnue";

  if (typeCapteur === "temperature") {
    if (valeur > 50) return { niveau: "CRITICAL", message: `Temperature ${piece}: ${valeur}°C` };
    if (valeur > 35) return { niveau: "WARNING", message: `Temperature ${piece}: ${valeur}°C` };
    return null;
  }

  if (typeCapteur === "fumee") {
    if (valeur > 70) return { niveau: "CRITICAL", message: `Fumee ${piece}: ${valeur}/100` };
    if (valeur > 40) return { niveau: "WARNING", message: `Fumee ${piece}: ${valeur}/100` };
    return null;
  }

  if (typeCapteur === "mouvement") {
    if (valeur === true) return { niveau: "INFO", message: `Mouvement detecte: ${piece}` };
    return null;
  }

  // Humidite : pas d'alerte
  return null;
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

  // Declarer l'exchange "validated" (au cas ou il n'existe pas encore)
  await canal.assertExchange("validated", "topic", { durable: false });

  // Declarer une queue auto-generee et la lier a l'exchange "validated"
  const { queue: nomQueue } = await canal.assertQueue("", { exclusive: true });
  await canal.bindQueue(nomQueue, "validated", "maison.#");

  console.log("[AMQP] Service Alertes demarre. En attente de messages...");
  console.log("[AMQP] Binding : validated -> maison.#");
  console.log();

  // Consommer les messages avec manual ack
  canal.consume(nomQueue, (msg) => {
    if (!msg) return;

    let donnees;
    try {
      donnees = JSON.parse(msg.content.toString());
    } catch (err) {
      console.log(`[ERREUR] Message non-JSON recu: ${msg.content.toString()}`);
      canal.ack(msg);
      return;
    }

    const alerte = detecterAlerte(donnees);

    if (alerte) {
      // Formater l'affichage avec un alignement
      if (alerte.niveau === "CRITICAL") {
        console.log(`[CRITICAL] ${alerte.message}`);
      } else if (alerte.niveau === "WARNING") {
        console.log(`[WARNING]  ${alerte.message}`);
      } else if (alerte.niveau === "INFO") {
        console.log(`[INFO]     ${alerte.message}`);
      }
    }

    // Toujours acquitter le message (meme sans alerte)
    canal.ack(msg);
  }, { noAck: false });

  // Gestion de l'arret propre
  process.on("SIGINT", async () => {
    console.log("\n[AMQP] Arret du service Alertes.");
    await canal.close();
    await connexion.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`[ERREUR] ${err.message}`);
  process.exit(1);
});
