#!/usr/bin/env python3
"""
Consumer RabbitMQ — Écoute la queue "capteurs" et affiche les messages reçus.
"""

import pika
import json

# Connexion au serveur RabbitMQ (localhost par défaut)
connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
channel = connection.channel()

# Déclaration de la queue "capteurs"
# On la déclare aussi côté consumer pour être sûr qu'elle existe
# (peu importe qui démarre en premier, producer ou consumer)
channel.queue_declare(queue='capteurs')


def callback(ch, method, properties, body):
    """Fonction appelée à chaque message reçu."""
    # Décodage du message JSON
    message = json.loads(body)

    # Extraction des données
    room = message.get("room", "inconnu")
    sensor = message.get("sensor", "inconnu")
    value = message.get("value", 0)

    # Affichage formaté selon le type de capteur
    if sensor == "temperature":
        print(f"[{room}] Temperature: {value}°C")
    elif sensor == "humidity":
        print(f"[{room}] Humidite: {value}%")
    else:
        print(f"[{room}] {sensor}: {value}")


# Abonnement à la queue "capteurs"
# auto_ack=True : les messages sont automatiquement acquittés (simplification session 1)
channel.basic_consume(
    queue='capteurs',
    on_message_callback=callback,
    auto_ack=True
)

print("[*] En attente de messages. Ctrl+C pour quitter")

try:
    # Lancement de l'écoute (boucle infinie)
    channel.start_consuming()
except KeyboardInterrupt:
    print("\n[*] Arrêt du consumer")
    channel.stop_consuming()

connection.close()
