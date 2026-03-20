#!/usr/bin/env node
/**
 * Consumer Monitoring - Recoit TOUS les messages de la maison
 *
 * Binding key : maison.#
 * Le wildcard # matche zero ou plusieurs mots, donc ce consumer recoit
 * absolument tous les messages dont la routing key commence par "maison."
 */

const amqp = require('amqplib');

const EXCHANGE_NAME = 'domotique';
const BINDING_KEY = 'maison.#';

async function main() {
  // Connexion a RabbitMQ
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declaration du Topic Exchange "domotique"
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: false });

  // Creation d'une queue exclusive (nom genere automatiquement, auto-delete)
  const q = await channel.assertQueue('', { exclusive: true });

  // Binding : on s'abonne a TOUS les messages de la maison
  await channel.bindQueue(q.queue, EXCHANGE_NAME, BINDING_KEY);

  console.log(`[*] Consumer MONITORING demarre (binding: ${BINDING_KEY})`);
  console.log('[*] En attente de TOUS les messages... Ctrl+C pour arreter.\n');

  // Consommation des messages
  channel.consume(q.queue, (msg) => {
    if (msg) {
      const message = JSON.parse(msg.content.toString());
      const value = message.value !== undefined ? message.value : 'N/A';
      const sensor = message.sensor || 'inconnu';
      const routingKey = msg.fields.routingKey;

      // Affichage adapte au type de capteur
      if (sensor === 'thermometre') {
        console.log(`[${routingKey}] Temperature: ${value}°C`);
      } else if (sensor === 'detecteur_mouvement') {
        console.log(`[${routingKey}] Mouvement: ${value}`);
      } else if (sensor === 'detecteur_fumee') {
        console.log(`[${routingKey}] Fumee: niveau ${value}`);
      } else {
        console.log(`[${routingKey}] ${JSON.stringify(message)}`);
      }
    }
  }, { noAck: true });

  // Gestion de l'arret propre
  process.on('SIGINT', () => {
    console.log('\n[*] Arret du consumer monitoring.');
    connection.close();
    process.exit(0);
  });
}

main().catch(console.error);
