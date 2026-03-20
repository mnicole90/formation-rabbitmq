#!/usr/bin/env php
<?php

/**
 * Service Validation — Vérifie la cohérence des données capteurs.
 *
 * Ce service consomme les messages AMQP depuis l'exchange `amq.topic`
 * (qui reçoit les messages MQTT via la passerelle RabbitMQ).
 * Il valide les valeurs selon des plages définies par type de capteur,
 * puis republie les messages valides sur l'exchange `validated`.
 *
 * Les messages invalides sont rejetés avec nack (sans remise en queue).
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// --- Configuration ---
$host = 'localhost';
$port = 5672;
$username = 'guest';
$password = 'guest';

// Plages de validation par type de capteur
$plagesValides = [
    'temperature' => ['min' => -20, 'max' => 60],
    'humidite'    => ['min' => 0, 'max' => 100],
    'fumee'       => ['min' => 0, 'max' => 100],
    // mouvement : doit être un booléen (traité séparément)
];

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

// Déclaration de l'exchange "validated" (type topic, durable)
// C'est ici que les messages validés seront republiés
$channel->exchange_declare('validated', 'topic', false, true, false);

// Création d'une queue exclusive (auto-supprimée à la déconnexion)
// Liée à l'exchange amq.topic avec le pattern maison.# pour recevoir tous les capteurs
list($queueName, ,) = $channel->queue_declare('', false, false, true, false);
$channel->queue_bind($queueName, 'amq.topic', 'maison.#');

echo "[VALIDATION] En attente de messages sur amq.topic (maison.#)...\n";

// Contrôle de flux : un seul message à la fois (prefetch)
$channel->basic_qos(null, 1, null);

/**
 * Callback de traitement des messages.
 * Valide les données et republie sur l'exchange "validated" si OK.
 */
$callback = function (AMQPMessage $msg) use ($channel, $plagesValides) {
    $routingKey = $msg->getRoutingKey();
    $body = json_decode($msg->getBody(), true);

    if ($body === null) {
        echo "[INVALIDE] Message non-JSON reçu, rejeté\n";
        $msg->nack(false);
        return;
    }

    $type = $body['sensor'] ?? 'inconnu';
    $valeur = $body['value'] ?? null;
    $piece = $body['room'] ?? 'inconnue';
    $valide = true;
    $raison = '';

    // Validation selon le type de capteur
    if ($type === 'mouvement') {
        // Le mouvement doit être un booléen
        if (!is_bool($valeur)) {
            $valide = false;
            $raison = "doit être un booléen, reçu: " . var_export($valeur, true);
        }
    } elseif (isset($plagesValides[$type])) {
        $plage = $plagesValides[$type];
        if (!is_numeric($valeur) || $valeur < $plage['min'] || $valeur > $plage['max']) {
            $valide = false;
            $raison = "hors plage {$plage['min']} à {$plage['max']}";
        }
    } else {
        $valide = false;
        $raison = "type de capteur inconnu";
    }

    if ($valide) {
        // Message valide : republier sur l'exchange "validated" avec la même routing key
        $newMsg = new AMQPMessage($msg->getBody(), [
            'content_type' => 'application/json',
            'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
        ]);
        $channel->basic_publish($newMsg, 'validated', $routingKey);

        echo "[VALIDE] $type $piece: " . json_encode($valeur) . "\n";

        // Acquittement du message (confirmation de traitement)
        $msg->ack();
    } else {
        // Message invalide : afficher l'erreur et rejeter sans remise en queue
        $unite = match ($type) {
            'temperature' => '°C',
            'humidite' => '%',
            default => '',
        };
        echo "[INVALIDE] $type $piece: " . json_encode($valeur) . "$unite ($raison)\n";

        // nack sans requeue : le message est définitivement rejeté
        $msg->nack(false);
    }
};

// Consommation avec acquittement manuel (no_ack = false)
$channel->basic_consume($queueName, '', false, false, false, false, $callback);

// Boucle d'attente des messages
while ($channel->is_consuming()) {
    $channel->wait();
}

// Fermeture propre (atteint uniquement si la boucle est interrompue)
$channel->close();
$connection->close();
