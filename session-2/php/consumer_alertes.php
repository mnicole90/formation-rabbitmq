<?php

/**
 * Consumer Alertes Fumee — MODE MANUAL ACK
 *
 * Ce consumer s'abonne uniquement aux messages de fumee
 * grace a la binding key "maison.*.fumee".
 *
 * IMPORTANT : ce consumer utilise manual ack (no_ack=false).
 * Cela signifie que le message reste dans la queue TANT QUE
 * le consumer n'a pas appele $msg->ack(). Si le consumer plante
 * avant l'ack, RabbitMQ re-delivre le message au prochain consumer.
 *
 * Comparez avec consumer_salon.php qui utilise auto_ack (moins fiable).
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

// Connexion au serveur RabbitMQ
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Declaration de la queue "alertes" (durable pour survivre aux redemarrages)
$channel->queue_declare('alertes', false, true, false, false);

// Binding : on s'abonne uniquement aux messages de fumee, quelle que soit la piece
$channel->queue_bind('alertes', 'domotique', 'maison.*.fumee');

echo "[*] Consumer Alertes Fumee demarre.\n";
echo "[*] Binding key : maison.*.fumee\n";
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
    $room = $data['room'] ?? 'inconnu';
    $niveau = $data['value'] ?? 0;

    echo "[ALERTE FUMEE] $room: niveau $niveau\n";

    // Simulation d'un traitement long (3 secondes)
    // C'est pendant ce delai que vous pouvez tester : tuez le consumer avec Ctrl+C
    // AVANT que l'ack ne soit envoye → le message sera re-delivre !
    echo "    → Traitement en cours (envoi SMS, declenchement alarme)...\n";
    sleep(3);
    echo "    → Traitement termine !\n";

    // Acquittement manuel : on confirme que le message a ete traite
    // C'est seulement ICI que RabbitMQ supprime le message de la queue
    $msg->ack();
};

// Lancement de la consommation avec manual ack (no_ack=false)
$channel->basic_consume('alertes', '', false, false, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}
