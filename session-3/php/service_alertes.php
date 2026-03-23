#!/usr/bin/env php
<?php

/**
 * Service Alertes — Détecte les seuils critiques sur les données validées.
 *
 * Ce service consomme les messages depuis l'exchange `validated`
 * (alimenté par le Service Validation) et génère des alertes
 * selon des seuils prédéfinis pour chaque type de capteur.
 *
 * Niveaux d'alerte :
 * - CRITICAL : situation dangereuse nécessitant une action immédiate
 * - WARNING  : situation anormale à surveiller
 * - INFO     : information contextuelle (mouvement détecté)
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// --- Configuration ---
$host = 'localhost';
$port = 5672;
$username = 'guest';
$password = 'guest';

// --- Connexion AMQP avec logique de retry ---
$connection = null;
$maxRetries = 10;

for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
    try {
        echo "[AMQP] Tentative de connexion $attempt/$maxRetries...\n";
        $connection = new AMQPStreamConnection($host, $port, $username, $password);
        echo "[AMQP] Connecté au broker AMQP sur $host:$port\n";
        break;
    } catch (\Exception $e) {
        echo "[AMQP] Échec de connexion : " . $e->getMessage() . "\n";
        if ($attempt === $maxRetries) {
            echo "[AMQP] Impossible de se connecter après $maxRetries tentatives. Abandon.\n";
            exit(1);
        }
        sleep(2);
    }
}

$channel = $connection->channel();

// Création d'une queue exclusive liée à l'exchange "validated"
// Le binding maison.# permet de recevoir tous les messages validés
list($queueName, ,) = $channel->queue_declare('', false, false, true, false);
$channel->queue_bind($queueName, 'validated', 'maison.#');

echo "[ALERTES] En attente de messages sur l'exchange validated (maison.#)...\n";

// Contrôle de flux : un seul message à la fois
$channel->basic_qos(null, 1, null);

/**
 * Callback de traitement des messages.
 * Analyse les valeurs et affiche les alertes selon les seuils définis.
 */
$callback = function (AMQPMessage $msg) {
    $body = json_decode($msg->getBody(), true);

    if ($body === null) {
        $msg->ack();
        return;
    }

    $type = $body['sensor'] ?? 'inconnu';
    $valeur = $body['value'] ?? null;
    $piece = $body['room'] ?? 'inconnue';

    // Détection des seuils selon le type de capteur
    switch ($type) {
        case 'temperature':
            if ($valeur > 50) {
                echo "[CRITICAL] Temperature $piece: {$valeur}°C\n";
            } elseif ($valeur > 35) {
                echo "[WARNING]  Temperature $piece: {$valeur}°C\n";
            }
            break;

        case 'fumee':
            if ($valeur > 70) {
                echo "[CRITICAL] Fumee $piece: $valeur/100\n";
            } elseif ($valeur > 40) {
                echo "[WARNING]  Fumee $piece: $valeur/100\n";
            }
            break;

        case 'mouvement':
            if ($valeur === true) {
                echo "[INFO]     Mouvement detecte: $piece\n";
            }
            break;

        case 'humidite':
            // Pas d'alerte pour l'humidité
            break;
    }

    // Acquittement du message après traitement
    $msg->ack();
};

// Consommation avec acquittement manuel (no_ack = false)
$channel->basic_consume($queueName, '', false, false, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}

// Fermeture propre
$channel->close();
$connection->close();
