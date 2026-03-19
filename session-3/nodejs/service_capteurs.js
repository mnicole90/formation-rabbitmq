#!/usr/bin/env node
/**
 * Service Capteurs — Publie des donnees de capteurs IoT via MQTT.
 *
 * Ce service simule 4 types de capteurs (temperature, humidite, mouvement, fumee)
 * repartis dans differentes pieces de la maison. Il publie les donnees sur des
 * topics MQTT de la forme maison/{piece}/{type}.
 *
 * Parfois, des valeurs aberrantes sont envoyees pour tester le service de validation.
 */

const mqtt = require("mqtt");

// Configuration MQTT
const MQTT_URL = "mqtt://localhost:1883";
const MQTT_OPTIONS = {
  username: "guest",
  password: "guest",
};

// Pieces de la maison
const PIECES = ["salon", "cuisine", "chambre", "entree"];

// Types de capteurs
const TYPES_CAPTEURS = ["temperature", "humidite", "mouvement", "fumee"];

/**
 * Genere une valeur pour un capteur donne.
 * 5% de chance d'envoyer une valeur aberrante pour temperature et fumee.
 */
function genererValeur(typeCapteur) {
  if (typeCapteur === "temperature") {
    // 5% de chance d'envoyer 999
    if (Math.random() < 0.05) return 999;
    return Math.round((Math.random() * 25 + 15) * 10) / 10; // 15-40
  }

  if (typeCapteur === "humidite") {
    return Math.round((Math.random() * 50 + 30) * 10) / 10; // 30-80
  }

  if (typeCapteur === "mouvement") {
    return Math.random() < 0.5;
  }

  if (typeCapteur === "fumee") {
    // 5% de chance d'envoyer une valeur elevee (95+)
    if (Math.random() < 0.05) {
      return Math.round((Math.random() * 5 + 95) * 10) / 10;
    }
    return Math.round(Math.random() * 100 * 10) / 10; // 0-100
  }
}

/**
 * Connexion MQTT avec logique de retry (10 tentatives, 2s entre chaque).
 */
function connecterMQTT() {
  let tentative = 0;
  const MAX_TENTATIVES = 10;

  return new Promise((resolve, reject) => {
    function essayer() {
      tentative++;
      console.log(`[MQTT] Tentative de connexion ${tentative}/${MAX_TENTATIVES}...`);

      const client = mqtt.connect(MQTT_URL, {
        ...MQTT_OPTIONS,
        reconnectPeriod: 0, // On gere le retry nous-memes
      });

      const timeout = setTimeout(() => {
        client.end(true);
        if (tentative < MAX_TENTATIVES) {
          console.log(`[MQTT] Tentative ${tentative}/${MAX_TENTATIVES} echouee`);
          setTimeout(essayer, 2000);
        } else {
          reject(new Error("Connexion MQTT impossible apres 10 tentatives"));
        }
      }, 5000);

      client.on("connect", () => {
        clearTimeout(timeout);
        console.log(`[MQTT] Connecte a ${MQTT_URL}`);
        resolve(client);
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        client.end(true);
        if (tentative < MAX_TENTATIVES) {
          console.log(`[MQTT] Tentative ${tentative}/${MAX_TENTATIVES} echouee : ${err.message}`);
          setTimeout(essayer, 2000);
        } else {
          reject(new Error("Connexion MQTT impossible apres 10 tentatives"));
        }
      });
    }

    essayer();
  });
}

/**
 * Boucle principale : genere et publie des donnees de capteurs.
 */
async function main() {
  const client = await connecterMQTT();

  console.log("[MQTT] Service Capteurs demarre. Ctrl+C pour arreter.");
  console.log();

  function publier() {
    // Choisir un capteur et une piece au hasard
    const typeCapteur = TYPES_CAPTEURS[Math.floor(Math.random() * TYPES_CAPTEURS.length)];
    const piece = PIECES[Math.floor(Math.random() * PIECES.length)];

    // Generer la valeur
    const valeur = genererValeur(typeCapteur);

    // Construire le message JSON
    const message = {
      sensor: typeCapteur,
      value: valeur,
      room: piece,
      timestamp: new Date().toISOString(),
    };

    // Construire le topic MQTT
    const topic = `maison/${piece}/${typeCapteur}`;

    // Publier le message
    const payload = JSON.stringify(message);
    client.publish(topic, payload);

    console.log(`[MQTT] Publie ${topic}: ${payload}`);

    // Planifier la prochaine publication (2 a 3 secondes)
    const delai = Math.random() * 1000 + 2000;
    setTimeout(publier, delai);
  }

  // Lancer la premiere publication
  publier();

  // Gestion de l'arret propre
  process.on("SIGINT", () => {
    console.log("\n[MQTT] Arret du service Capteurs.");
    client.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`[ERREUR] ${err.message}`);
  process.exit(1);
});
