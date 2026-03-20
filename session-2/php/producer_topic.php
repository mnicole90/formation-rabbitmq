<?php

/**
 * Producer Topic Exchange - Simulateur de capteurs domotiques
 *
 * Ce script simule 3 capteurs IoT qui publient des messages
 * sur un Topic Exchange avec des routing keys differentes.
 */

require_once __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

// Connexion au serveur RabbitMQ
$host = getenv('RABBITMQ_HOST') ?: 'rabbitmq';
$port = (int) (getenv('RABBITMQ_PORT') ?: 5672);
$connection = new AMQPStreamConnection($host, $port, 'guest', 'guest');
$channel = $connection->channel();

// Declaration du Topic Exchange "domotique"
// Les parametres : nom, type, passive, durable, auto_delete
$channel->exchange_declare('domotique', 'topic', false, true, false);

echo "[*] Producer demarre. Envoi de messages toutes les 3 secondes...\n";
echo "[*] Appuyez sur Ctrl+C pour arreter.\n\n";

// Definition des 3 capteurs avec leurs routing keys
$capteurs = [
    [
        'routing_key' => 'maison.salon.temperature',
        'sensor' => 'temperature',
        'room' => 'salon',
        // Genere une valeur aleatoire entre 15.0 et 35.0
        'value_fn' => function () {
            return round(mt_rand(150, 350) / 10, 1);
        },
    ],
    [
        'routing_key' => 'maison.entree.mouvement',
        'sensor' => 'mouvement',
        'room' => 'entree',
        // Genere true ou false aleatoirement
        'value_fn' => function () {
            return (bool) mt_rand(0, 1);
        },
    ],
    [
        'routing_key' => 'maison.cuisine.fumee',
        'sensor' => 'fumee',
        'room' => 'cuisine',
        // Genere un niveau de fumee entre 0 et 100
        'value_fn' => function () {
            return mt_rand(0, 100);
        },
    ],
];

// Index pour alterner entre les capteurs
$index = 0;

// Boucle infinie d'envoi de messages
while (true) {
    $capteur = $capteurs[$index % count($capteurs)];
    $index++;

    // Construction du message en JSON
    $data = [
        'sensor' => $capteur['sensor'],
        'value' => ($capteur['value_fn'])(),
        'room' => $capteur['room'],
        'timestamp' => date('c'),
    ];

    $message = json_encode($data);

    // Publication du message sur l'exchange avec la routing key
    $msg = new AMQPMessage($message, [
        'content_type' => 'application/json',
    ]);
    $channel->basic_publish($msg, 'domotique', $capteur['routing_key']);

    echo "[x] Envoye {$capteur['routing_key']}: $message\n";

    // Pause de 3 secondes entre chaque envoi
    sleep(3);
}

// Fermeture propre (jamais atteint dans la boucle infinie)
$channel->close();
$connection->close();
