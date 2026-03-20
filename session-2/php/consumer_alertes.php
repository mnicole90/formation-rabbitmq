<?php

/**
 * Consumer Alertes Fumee
 *
 * Ce consumer s'abonne uniquement aux messages de fumee
 * grace a la binding key "maison.*.fumee".
 * Le wildcard * matche exactement un mot (ici, le nom de la piece).
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

// Connexion au serveur RabbitMQ
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Declaration du Topic Exchange "domotique"
$channel->exchange_declare('domotique', 'topic', false, true, false);

// Creation d'une queue exclusive et auto-delete
// Le nom est genere automatiquement par RabbitMQ
list($queue_name, ,) = $channel->queue_declare('', false, false, true, true);

// Binding : on s'abonne uniquement aux messages de fumee, quelle que soit la piece
$channel->queue_bind($queue_name, 'domotique', 'maison.*.fumee');

echo "[*] Consumer Alertes Fumee demarre.\n";
echo "[*] Binding key : maison.*.fumee\n";
echo "[*] En attente de messages. Ctrl+C pour quitter.\n\n";

// Callback appele pour chaque message recu
$callback = function ($msg) {
    $data = json_decode($msg->getBody(), true);
    $room = $data['room'] ?? 'inconnu';
    $niveau = $data['value'] ?? 0;

    echo "[ALERTE FUMEE] $room: niveau $niveau\n";
};

// Lancement de la consommation avec auto_ack=true
$channel->basic_consume($queue_name, '', false, true, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}

// Fermeture propre
$channel->close();
$connection->close();
