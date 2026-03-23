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
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Declaration de la queue "monitoring" (durable pour survivre aux redemarrages)
$channel->queue_declare('monitoring', false, true, false, false);

// Binding : on s'abonne a tous les messages commencant par "maison."
$channel->queue_bind('monitoring', 'domotique', 'maison.#');

echo "[*] Consumer Monitoring demarre.\n";
echo "[*] Binding key : maison.#\n";
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

    // Acquittement manuel : on confirme que le message a ete traite
    $msg->ack();
};

// Lancement de la consommation avec manual ack (no_ack=false)
$channel->basic_consume('monitoring', '', false, false, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}
