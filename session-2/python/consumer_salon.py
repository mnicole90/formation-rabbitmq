#!/usr/bin/env python3
"""
Consumer Salon - Recoit uniquement les messages du salon

Binding key : maison.salon.*
Le wildcard * matche exactement un mot, donc ce consumer recoit tous les
capteurs du salon (temperature, mouvement, fumee, etc.)
"""

import pika
import json

# Connexion a RabbitMQ
connection = pika.BlockingConnection(
    pika.ConnectionParameters('localhost')
)
channel = connection.channel()

# Declaration du Topic Exchange "domotique"
channel.exchange_declare(
    exchange='domotique',
    exchange_type='topic'
)

# Creation d'une queue exclusive (nom genere automatiquement, auto-delete)
result = channel.queue_declare(queue='', exclusive=True)
queue_name = result.method.queue

# Binding : on s'abonne uniquement aux messages du salon
binding_key = 'maison.salon.*'
channel.queue_bind(
    exchange='domotique',
    queue=queue_name,
    routing_key=binding_key
)

print(f"[*] Consumer SALON demarre (binding: {binding_key})")
print("[*] En attente des messages du salon... Ctrl+C pour arreter.\n")


def callback(ch, method, properties, body):
    """Callback appele a chaque message recu"""
    message = json.loads(body)
    sensor = message.get('sensor', 'inconnu')
    value = message.get('value', 'N/A')

    # Affichage adapte au type de capteur
    if sensor == 'thermometre':
        print(f"[SALON] Temperature: {value}°C")
    elif sensor == 'detecteur_mouvement':
        print(f"[SALON] Mouvement detecte: {value}")
    elif sensor == 'detecteur_fumee':
        print(f"[SALON] Fumee: niveau {value}")
    else:
        print(f"[SALON] {sensor}: {value}")


# Consommation des messages (auto_ack=True pour simplifier)
channel.basic_consume(
    queue=queue_name,
    on_message_callback=callback,
    auto_ack=True
)

try:
    channel.start_consuming()
except KeyboardInterrupt:
    print("\n[*] Arret du consumer salon.")
    connection.close()
