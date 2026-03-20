#!/usr/bin/env php
<?php

/**
 * Service Capteurs — Publie des données de capteurs IoT via MQTT.
 *
 * Ce service simule des capteurs dans une maison connectée.
 * Il publie sur des topics MQTT de la forme : maison/{pièce}/{type}
 *
 * IMPORTANT : MQTT utilise le séparateur `/` dans les topics.
 * RabbitMQ convertit automatiquement les `/` MQTT en `.` pour le routage AMQP.
 * Ainsi, le topic MQTT `maison/salon/temperature` devient la routing key AMQP `maison.salon.temperature`.
 * C'est la passerelle MQTT <-> AMQP intégrée à RabbitMQ qui fait cette conversion.
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;

// --- Configuration ---
$host = 'localhost';
$port = 1883;
$username = 'guest';
$password = 'guest';
$clientId = 'service-capteurs-' . getmypid();

// Types de capteurs et pièces de la maison
$types = ['temperature', 'humidite', 'mouvement', 'fumee'];
$pieces = ['salon', 'cuisine', 'chambre', 'entree'];

// --- Connexion MQTT avec logique de retry ---
$client = null;
$maxRetries = 10;

for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
    try {
        echo "[MQTT] Tentative de connexion $attempt/$maxRetries...\n";

        $client = new MqttClient($host, $port, $clientId);
        $connectionSettings = (new ConnectionSettings())
            ->setUsername($username)
            ->setPassword($password);

        $client->connect($connectionSettings);
        echo "[MQTT] Connecté au broker MQTT sur $host:$port\n";
        break;
    } catch (\Exception $e) {
        echo "[MQTT] Échec de connexion : " . $e->getMessage() . "\n";
        if ($attempt === $maxRetries) {
            echo "[MQTT] Impossible de se connecter après $maxRetries tentatives. Abandon.\n";
            exit(1);
        }
        sleep(2);
    }
}

/**
 * Génère une valeur aléatoire selon le type de capteur.
 * Inclut une probabilité de 5% de valeur aberrante pour température et fumée.
 */
function genererValeur(string $type): mixed
{
    switch ($type) {
        case 'temperature':
            // 5% de chance d'envoyer une valeur aberrante (999)
            if (mt_rand(1, 100) <= 5) {
                return 999;
            }
            // Valeur normale entre 15 et 40°C (avec décimale)
            return round(mt_rand(150, 400) / 10, 1);

        case 'humidite':
            // Valeur entre 30 et 80%
            return mt_rand(30, 80);

        case 'mouvement':
            // Booléen aléatoire
            return (bool) mt_rand(0, 1);

        case 'fumee':
            // 5% de chance de valeur élevée (95+)
            if (mt_rand(1, 100) <= 5) {
                return mt_rand(95, 100);
            }
            // Valeur normale entre 0 et 100
            return mt_rand(0, 100);

        default:
            return 0;
    }
}

// --- Boucle principale d'envoi des données ---
echo "[MQTT] Démarrage de la publication des capteurs...\n";

while (true) {
    // Choix aléatoire d'un type de capteur et d'une pièce
    $type = $types[array_rand($types)];
    $piece = $pieces[array_rand($pieces)];

    // Génération de la valeur
    $valeur = genererValeur($type);

    // Construction du message JSON
    $message = json_encode([
        'sensor'    => $type,
        'value'     => $valeur,
        'room'      => $piece,
        'timestamp' => date('c'), // Format ISO 8601
    ]);

    // Le topic MQTT utilise `/` comme séparateur
    // RabbitMQ le convertira en `.` pour le routage AMQP (ex: maison.salon.temperature)
    $topic = "maison/$piece/$type";

    // Publication du message
    $client->publish($topic, $message);
    echo "[MQTT] Publié $topic: $message\n";

    // Pause aléatoire entre 2 et 3 secondes
    sleep(mt_rand(2, 3));
}
