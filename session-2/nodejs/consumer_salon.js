#!/usr/bin/env node
/**
 * Consumer Salon - Recoit uniquement les messages du salon
 *
 * Binding key : maison.salon.*
 * Le wildcard * matche exactement un mot, donc ce consumer recoit tous les
 * capteurs du salon (temperature, mouvement, fumee, etc.)
 */

const amqp = require('amqplib');

const EXCHANGE_NAME = 'domotique';
const BINDING_KEY = 'maison.salon.*';

async function main() {
  // Connexion a RabbitMQ
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declaration du Topic Exchange "domotique"
  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: false });

  // Creation d'une queue exclusive (nom genere automatiquement, auto-delete)
  const q = await channel.assertQueue('', { exclusive: true });

  // Binding : on s'abonne uniquement aux messages du salon
  await channel.bindQueue(q.queue, EXCHANGE_NAME, BINDING_KEY);

  console.log(`[*] Consumer SALON demarre (binding: ${BINDING_KEY})`);
  console.log('[*] En attente des messages du salon... Ctrl+C pour arreter.\n');

  // Consommation des messages
  channel.consume(q.queue, (msg) => {
    if (msg) {
      const message = JSON.parse(msg.content.toString());
      const sensor = message.sensor || 'inconnu';
      const value = message.value !== undefined ? message.value : 'N/A';

      // Affichage adapte au type de capteur
      if (sensor === 'thermometre') {
        console.log(`[SALON] Temperature: ${value}°C`);
      } else if (sensor === 'detecteur_mouvement') {
        console.log(`[SALON] Mouvement detecte: ${value}`);
      } else if (sensor === 'detecteur_fumee') {
        console.log(`[SALON] Fumee: niveau ${value}`);
      } else {
        console.log(`[SALON] ${sensor}: ${value}`);
      }
    }
  }, { noAck: true });

  // Gestion de l'arret propre
  process.on('SIGINT', () => {
    console.log('\n[*] Arret du consumer salon.');
    connection.close();
    process.exit(0);
  });
}

main().catch(console.error);
