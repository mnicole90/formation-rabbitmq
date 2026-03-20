#!/usr/bin/env php
<?php

/**
 * Consumer RabbitMQ — Réception des données de capteurs IoT
 *
 * Ce script se connecte à RabbitMQ, déclare la queue "capteurs"
 * et écoute les messages entrants pour les afficher en temps réel.
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

// Connexion au serveur RabbitMQ
$connection = new AMQPStreamConnection('localhost', 5672, 'guest', 'guest');
$channel = $connection->channel();

// Déclaration de la queue "capteurs"
// On la déclare aussi côté consumer pour pouvoir démarrer dans n'importe quel ordre
$channel->queue_declare('capteurs', false, true, false, false);

echo " [*] En attente de messages. CTRL+C pour quitter\n";

// Fermeture propre lors de l'arrêt du script
register_shutdown_function(function () use ($channel, $connection) {
    $channel->close();
    $connection->close();
    echo "\n [x] Connexion fermée proprement\n";
});

// Callback appelé à chaque message reçu
$callback = function ($msg) {
    // Décodage du message JSON
    $data = json_decode($msg->body, true);

    if ($data === null) {
        echo " [!] Message invalide: $msg->body\n";
        return;
    }

    // Affichage formaté selon le type de capteur
    $room = $data['room'] ?? 'inconnu';
    $sensor = $data['sensor'] ?? 'inconnu';
    $value = $data['value'] ?? '?';

    if ($sensor === 'temperature') {
        echo " [$room] Température: {$value}°C\n";
    } elseif ($sensor === 'humidity') {
        echo " [$room] Humidité: {$value}%\n";
    } else {
        echo " [$room] $sensor: $value\n";
    }
};

// Consommation des messages avec auto-acknowledge (auto_ack=true)
// En session 1, on utilise l'auto-ack pour simplifier
$channel->basic_consume('capteurs', '', false, true, false, false, $callback);

// Boucle d'écoute des messages
$channel->consume();
