#!/usr/bin/env python3
"""
Producer Topic Exchange - Simulateur de capteurs domotique

Ce script simule 3 capteurs qui publient des messages sur un Topic Exchange.
Chaque capteur utilise une routing key differente :
  - maison.salon.temperature
  - maison.entree.mouvement
  - maison.cuisine.fumee
"""

import pika
import json
import random
import time
from datetime import datetime

# Connexion a RabbitMQ (localhost avec guest/guest)
connection = pika.BlockingConnection(
    pika.ConnectionParameters('localhost')
)
channel = connection.channel()

# Declaration du Topic Exchange "domotique"
channel.exchange_declare(
    exchange='domotique',
    exchange_type='topic'
)

print("[*] Producer demarre. Envoi de messages toutes les 3 secondes...")
print("[*] Appuyez sur Ctrl+C pour arreter.\n")

# Liste des capteurs a simuler
capteurs = [
    {
        'routing_key': 'maison.salon.temperature',
        'sensor': 'thermometre',
        'room': 'salon',
        'generate_value': lambda: round(random.uniform(15, 35), 1)
    },
    {
        'routing_key': 'maison.entree.mouvement',
        'sensor': 'detecteur_mouvement',
        'room': 'entree',
        'generate_value': lambda: random.choice([True, False])
    },
    {
        'routing_key': 'maison.cuisine.fumee',
        'sensor': 'detecteur_fumee',
        'room': 'cuisine',
        'generate_value': lambda: random.randint(0, 100)
    }
]

try:
    # Index pour alterner entre les capteurs
    index = 0

    while True:
        # Selectionner le capteur courant
        capteur = capteurs[index % len(capteurs)]

        # Generer le message JSON
        message = {
            'sensor': capteur['sensor'],
            'room': capteur['room'],
            'value': capteur['generate_value'](),
            'timestamp': datetime.now().isoformat()
        }

        # Publier le message sur l'exchange "domotique"
        channel.basic_publish(
            exchange='domotique',
            routing_key=capteur['routing_key'],
            body=json.dumps(message)
        )

        print(f"[x] Envoye {capteur['routing_key']}: {json.dumps(message)}")

        # Attendre 3 secondes avant le prochain envoi
        time.sleep(3)
        index += 1

except KeyboardInterrupt:
    print("\n[*] Arret du producer.")
    connection.close()
