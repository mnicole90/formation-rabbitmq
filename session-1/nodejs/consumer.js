/**
 * Consumer RabbitMQ — Écoute la queue "capteurs" et affiche les messages reçus.
 */

const amqp = require("amqplib");

async function main() {
  // Connexion au serveur RabbitMQ (localhost par défaut)
  const connection = await amqp.connect("amqp://localhost");
  const channel = await connection.createChannel();

  // Nom de la queue
  const queue = "capteurs";

  // Déclaration de la queue "capteurs"
  // On la déclare aussi côté consumer pour être sûr qu'elle existe
  await channel.assertQueue(queue);

  console.log("[*] En attente de messages. Ctrl+C pour quitter");

  // Abonnement à la queue "capteurs"
  // noAck: true — les messages sont automatiquement acquittés (simplification session 1)
  channel.consume(
    queue,
    (msg) => {
      if (msg !== null) {
        // Décodage du message JSON
        const message = JSON.parse(msg.content.toString());

        // Extraction des données
        const room = message.room || "inconnu";
        const sensor = message.sensor || "inconnu";
        const value = message.value || 0;

        // Affichage formaté selon le type de capteur
        if (sensor === "temperature") {
          console.log(`[${room}] Temperature: ${value}°C`);
        } else if (sensor === "humidity") {
          console.log(`[${room}] Humidite: ${value}%`);
        } else {
          console.log(`[${room}] ${sensor}: ${value}`);
        }
      }
    },
    { noAck: true }
  );

  // Gestion de l'arrêt propre avec Ctrl+C
  process.on("SIGINT", async () => {
    console.log("\n[*] Arrêt du consumer");
    await channel.close();
    await connection.close();
    process.exit(0);
  });
}

// Lancement du consumer
main().catch(console.error);
