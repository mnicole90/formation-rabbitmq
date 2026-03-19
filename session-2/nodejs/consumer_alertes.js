#!/usr/bin/env node
/**
 * Consumer Alertes - Recoit uniquement les messages de fumee
 *
 * Binding key : maison.*.fumee
 * Le wildcard * matche exactement un mot, donc ce consumer recoit les messages
 * de fumee de n'importe quelle piece (cuisine, salon, garage, etc.)
 */

const amqp = require('amqplib');

const EXCHANGE_NAME = 'domotique';
const BINDING_KEY = 'maison.*.fumee';

async function main() {
  // Connexion a RabbitMQ
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declaration du Topic Exchange "domotique"
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: false });

  // Creation d'une queue exclusive (nom genere automatiquement, auto-delete)
  const q = await channel.assertQueue('', { exclusive: true });

  // Binding : on s'abonne uniquement aux messages de fumee
  await channel.bindQueue(q.queue, EXCHANGE_NAME, BINDING_KEY);

  console.log(`[*] Consumer ALERTES demarre (binding: ${BINDING_KEY})`);
  console.log('[*] En attente de messages de fumee... Ctrl+C pour arreter.\n');

  // Consommation des messages
  channel.consume(q.queue, (msg) => {
    if (msg) {
      const message = JSON.parse(msg.content.toString());
      const room = message.room || 'inconnu';
      const value = message.value !== undefined ? message.value : 'N/A';
      console.log(`[ALERTE FUMEE] ${room}: niveau ${value}`);
    }
  }, { noAck: true });

  // Gestion de l'arret propre
  process.on('SIGINT', () => {
    console.log('\n[*] Arret du consumer alertes.');
    connection.close();
    process.exit(0);
  });
}

main().catch(console.error);
