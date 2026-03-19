#!/usr/bin/env python3
"""
Consumer Monitoring - Recoit TOUS les messages de la maison

Binding key : maison.#
Le wildcard # matche zero ou plusieurs mots, donc ce consumer recoit
absolument tous les messages dont la routing key commence par "maison."
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

# Binding : on s'abonne a TOUS les messages de la maison
binding_key = 'maison.#'
channel.queue_bind(
    exchange='domotique',
    queue=queue_name,
    routing_key=binding_key
)

print(f"[*] Consumer MONITORING demarre (binding: {binding_key})")
print("[*] En attente de TOUS les messages... Ctrl+C pour arreter.\n")


def callback(ch, method, properties, body):
    """Callback appele a chaque message recu"""
    message = json.loads(body)
    value = message.get('value', 'N/A')
    sensor = message.get('sensor', 'inconnu')

    # Affichage avec la routing key pour savoir d'ou vient le message
    if sensor == 'thermometre':
        print(f"[{method.routing_key}] Temperature: {value}°C")
    elif sensor == 'detecteur_mouvement':
        print(f"[{method.routing_key}] Mouvement: {value}")
    elif sensor == 'detecteur_fumee':
        print(f"[{method.routing_key}] Fumee: niveau {value}")
    else:
        print(f"[{method.routing_key}] {message}")


# Consommation des messages (auto_ack=True pour simplifier)
channel.basic_consume(
    queue=queue_name,
    on_message_callback=callback,
    auto_ack=True
)

try:
    channel.start_consuming()
except KeyboardInterrupt:
    print("\n[*] Arret du consumer monitoring.")
    connection.close()
