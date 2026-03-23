<?php

/**
 * Consumer Salon — MODE AUTO ACK
 *
 * Ce consumer s'abonne uniquement aux messages du salon
 * grace a la binding key "maison.salon.*".
 *
 * IMPORTANT : ce consumer utilise auto_ack=true.
 * Cela signifie que le message est considere comme traite
 * DES QU'IL EST ENVOYE au consumer, meme si le traitement
 * n'est pas termine. Si le consumer plante avant d'avoir
 * fini le traitement, le message est PERDU.
 *
 * Comparez avec consumer_alertes.php et consumer_monitoring.php
 * qui utilisent manual ack (plus fiable).
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

// Connexion au serveur RabbitMQ
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Declaration de la queue "salon" (durable)
$channel->queue_declare('salon', false, true, false, false);

// Binding : on s'abonne uniquement aux messages du salon
$channel->queue_bind('salon', 'domotique', 'maison.salon.*');

echo "[*] Consumer Salon demarre (mode AUTO ACK).\n";
echo "[*] Binding key : maison.salon.*\n";
echo "[*] En attente de messages. Ctrl+C pour quitter.\n\n";

// Fermeture propre lors de l'arret du script
register_shutdown_function(function () use ($channel, $connection) {
    $channel->close();
    $connection->close();
    echo "\n[x] Connexion fermee proprement\n";
});

// Callback appele pour chaque message recu
$callback = function ($msg) {
    $data = json_decode($msg->getBody(), true);
    $routingKey = $msg->getRoutingKey();

    $sensor = $data['sensor'] ?? 'inconnu';
    $value = $data['value'] ?? '';

    switch ($sensor) {
        case 'temperature':
            echo "[$routingKey] Temperature: {$value}°C\n";
            break;
        case 'mouvement':
            $etat = $value ? 'detecte' : 'rien';
            echo "[$routingKey] Mouvement: $etat\n";
            break;
        case 'fumee':
            echo "[$routingKey] Fumee: niveau $value\n";
            break;
        default:
            echo "[$routingKey] $sensor: $value\n";
    }

    // Simulation d'un traitement long (3 secondes)
    echo "    → Traitement en cours...\n";
    sleep(3);
    echo "    → Traitement termine !\n";

    // PAS de $msg->ack() ici : en auto_ack, le message est deja
    // considere comme traite avant meme que le callback s'execute.
};

// Lancement de la consommation avec AUTO ACK (no_ack=true)
// Le 4eme parametre (true) = auto_ack active
$channel->basic_consume('salon', '', false, true, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}
