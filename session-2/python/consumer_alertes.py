#!/usr/bin/env python3
"""
Consumer Alertes - Recoit uniquement les messages de fumee

Binding key : maison.*.fumee
Le wildcard * matche exactement un mot, donc ce consumer recoit les messages
de fumee de n'importe quelle piece (cuisine, salon, garage, etc.)
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

# Binding : on s'abonne uniquement aux messages de fumee
binding_key = 'maison.*.fumee'
channel.queue_bind(
    exchange='domotique',
    queue=queue_name,
    routing_key=binding_key
)

print(f"[*] Consumer ALERTES demarre (binding: {binding_key})")
print("[*] En attente de messages de fumee... Ctrl+C pour arreter.\n")


def callback(ch, method, properties, body):
    """Callback appele a chaque message recu"""
    message = json.loads(body)
    room = message.get('room', 'inconnu')
    value = message.get('value', 'N/A')
    print(f"[ALERTE FUMEE] {room}: niveau {value}")


# Consommation des messages (auto_ack=True pour simplifier)
channel.basic_consume(
    queue=queue_name,
    on_message_callback=callback,
    auto_ack=True
)

try:
    channel.start_consuming()
except KeyboardInterrupt:
    print("\n[*] Arret du consumer alertes.")
    connection.close()
