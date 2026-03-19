#!/usr/bin/env python3
"""
Producer RabbitMQ — Simulateur de capteur de température.
Envoie un message JSON toutes les 5 secondes sur la queue "capteurs".
"""

import pika
import json
import random
import time
from datetime import datetime

# Connexion au serveur RabbitMQ (localhost par défaut)
connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
channel = connection.channel()

# Déclaration de la queue "capteurs"
# Si la queue existe déjà, cette commande ne fait rien
channel.queue_declare(queue='capteurs')

print("[*] Démarrage du producer. Ctrl+C pour arrêter")

try:
    while True:
        # Génération d'une température aléatoire entre 15 et 35°C
        temperature = round(random.uniform(15, 35), 1)

        # Construction du message JSON
        message = {
            "sensor": "temperature",
            "value": temperature,
            "room": "salon",
            "timestamp": datetime.now().isoformat()
        }

        # Conversion en chaîne JSON
        message_json = json.dumps(message)

        # Publication du message sur la queue "capteurs"
        channel.basic_publish(
            exchange='',           # Exchange par défaut
            routing_key='capteurs',  # Nom de la queue
            body=message_json
        )

        print(f"[x] Envoyé: {message_json}")

        # Attente de 5 secondes avant le prochain envoi
        time.sleep(5)

except KeyboardInterrupt:
    print("\n[*] Arrêt du producer")
    connection.close()
