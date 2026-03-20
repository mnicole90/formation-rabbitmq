#!/usr/bin/env php
<?php

/**
 * Producer RabbitMQ — Simulation d'un capteur de température IoT
 *
 * Ce script se connecte à RabbitMQ, déclare une queue "capteurs"
 * et envoie un message JSON toutes les 5 secondes avec une
 * température aléatoire simulant un capteur dans le salon.
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// Connexion au serveur RabbitMQ
// Le host est "rabbitmq" dans Docker, "localhost" en local
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Déclaration de la queue "capteurs"
// Si la queue existe déjà, cette opération est sans effet
$channel->queue_declare('capteurs', false, true, false, false);

echo " [*] Producer démarré. CTRL+C pour quitter\n";

// Fermeture propre lors de l'arrêt du script
register_shutdown_function(function () use ($channel, $connection) {
    $channel->close();
    $connection->close();
    echo "\n [x] Connexion fermée proprement\n";
});

// Boucle infinie : envoi d'un message toutes les 5 secondes
while (true) {
    // Génération d'une température aléatoire entre 15.0 et 35.0°C
    $temperature = round(mt_rand(150, 350) / 10, 1);

    // Construction du message JSON
    $data = [
        'sensor'    => 'temperature',
        'value'     => $temperature,
        'room'      => 'salon',
        'timestamp' => date('c'), // Format ISO 8601
    ];
    $json = json_encode($data);

    // Publication du message sur la queue "capteurs"
    $message = new AMQPMessage($json);
    $channel->basic_publish($message, '', 'capteurs');

    echo " [x] Envoyé: $json\n";

    // Attente de 5 secondes avant le prochain envoi
    sleep(5);
}
