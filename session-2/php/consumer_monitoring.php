<?php

/**
 * Consumer Monitoring
 *
 * Ce consumer s'abonne a TOUS les messages de la maison
 * grace a la binding key "maison.#".
 * Le wildcard # matche zero ou plusieurs mots.
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

// Connexion au serveur RabbitMQ
$connection = new AMQPStreamConnection('localhost', 5672, 'guest', 'guest');
$channel = $connection->channel();

// Declaration du Topic Exchange "domotique"
$channel->exchange_declare('domotique', 'topic', false, true, false);

// Creation d'une queue exclusive et auto-delete
list($queue_name, ,) = $channel->queue_declare('', false, false, true, true);

// Binding : on s'abonne a tous les messages commencant par "maison."
$channel->queue_bind($queue_name, 'domotique', 'maison.#');

echo "[*] Consumer Monitoring demarre.\n";
echo "[*] Binding key : maison.#\n";
echo "[*] En attente de messages. Ctrl+C pour quitter.\n\n";

// Callback appele pour chaque message recu
$callback = function ($msg) {
    $data = json_decode($msg->getBody(), true);
    $routingKey = $msg->getRoutingKey();

    // Affichage formate selon le type de capteur
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
