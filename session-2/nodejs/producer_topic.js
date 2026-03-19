#!/usr/bin/env node
/**
 * Producer Topic Exchange - Simulateur de capteurs domotique
 *
 * Ce script simule 3 capteurs qui publient des messages sur un Topic Exchange.
 * Chaque capteur utilise une routing key differente :
 *   - maison.salon.temperature
 *   - maison.entree.mouvement
 *   - maison.cuisine.fumee
 */

const amqp = require('amqplib');

const EXCHANGE_NAME = 'domotique';

// Liste des capteurs a simuler
const capteurs = [
  {
    routingKey: 'maison.salon.temperature',
    sensor: 'thermometre',
    room: 'salon',
    generateValue: () => +(Math.random() * (35 - 15) + 15).toFixed(1)
  },
  {
    routingKey: 'maison.entree.mouvement',
    sensor: 'detecteur_mouvement',
    room: 'entree',
    generateValue: () => Math.random() > 0.5
  },
  {
    routingKey: 'maison.cuisine.fumee',
    sensor: 'detecteur_fumee',
    room: 'cuisine',
    generateValue: () => Math.floor(Math.random() * 101)
  }
];

async function main() {
  // Connexion a RabbitMQ (localhost avec guest/guest)
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declaration du Topic Exchange "domotique"
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: false });

  console.log('[*] Producer demarre. Envoi de messages toutes les 3 secondes...');
  console.log('[*] Appuyez sur Ctrl+C pour arreter.\n');

  let index = 0;

  // Envoi d'un message toutes les 3 secondes
  setInterval(() => {
    const capteur = capteurs[index % capteurs.length];

    // Generer le message JSON
    const message = {
      sensor: capteur.sensor,
      room: capteur.room,
      value: capteur.generateValue(),
      timestamp: new Date().toISOString()
    };

    const body = JSON.stringify(message);

    // Publier le message sur l'exchange "domotique"
    channel.publish(EXCHANGE_NAME, capteur.routingKey, Buffer.from(body));
    console.log(`[x] Envoye ${capteur.routingKey}: ${body}`);

    index++;
  }, 3000);

  // Gestion de l'arret propre
  process.on('SIGINT', () => {
    console.log('\n[*] Arret du producer.');
    connection.close();
    process.exit(0);
  });
}

main().catch(console.error);
