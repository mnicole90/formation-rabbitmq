/**
 * Producer RabbitMQ — Simulateur de capteur de température.
 * Envoie un message JSON toutes les 5 secondes sur la queue "capteurs".
 */

const amqp = require("amqplib");

async function main() {
  // Connexion au serveur RabbitMQ (localhost par défaut)
  const connection = await amqp.connect("amqp://localhost");
  const channel = await connection.createChannel();

  // Nom de la queue
  const queue = "capteurs";

  // Déclaration de la queue "capteurs"
  await channel.assertQueue(queue);

  console.log("[*] Démarrage du producer. Ctrl+C pour arrêter");

  // Envoi d'un message toutes les 5 secondes
  setInterval(() => {
    // Génération d'une température aléatoire entre 15 et 35°C
    const temperature = Math.round((Math.random() * 20 + 15) * 10) / 10;

    // Construction du message JSON
    const message = {
      sensor: "temperature",
      value: temperature,
      room: "salon",
      timestamp: new Date().toISOString(),
    };

    // Conversion en chaîne JSON et envoi sur la queue
    const messageJson = JSON.stringify(message);
    channel.sendToQueue(queue, Buffer.from(messageJson));

    console.log(`[x] Envoyé: ${messageJson}`);
  }, 5000);

  // Gestion de l'arrêt propre avec Ctrl+C
  process.on("SIGINT", async () => {
    console.log("\n[*] Arrêt du producer");
    await channel.close();
    await connection.close();
    process.exit(0);
  });
}

// Lancement du producer
main().catch(console.error);
