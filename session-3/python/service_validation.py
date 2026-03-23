#!/usr/bin/env python3
"""
Service Validation — Verifie la coherence des donnees de capteurs.

Ce service consomme les messages AMQP depuis l'exchange amq.topic (binding maison.#),
verifie que les valeurs sont dans les plages acceptables, puis :
- Si valide : republier sur l'exchange "validated" avec la meme routing key
- Si invalide : rejeter le message (nack, sans requeue)

Utilise le manual ack pour garantir le traitement de chaque message.
"""

import json
import time

import pika

# Configuration AMQP
AMQP_HOST = "localhost"
AMQP_USER = "guest"
AMQP_PASS = "guest"

# Plages valides pour chaque type de capteur
PLAGES_VALIDES = {
    "temperature": (-20, 60),
    "humidite": (0, 100),
    "fumee": (0, 100),
}


def connecter_amqp():
    """
    Se connecte au broker AMQP avec logique de retry.
    Tente 10 fois avec un delai de 2 secondes entre chaque tentative.
    """
    credentials = pika.PlainCredentials(AMQP_USER, AMQP_PASS)
    parametres = pika.ConnectionParameters(
        host=AMQP_HOST,
        credentials=credentials
    )

    for tentative in range(1, 11):
        try:
            connexion = pika.BlockingConnection(parametres)
            print(f"[AMQP] Connecte a {AMQP_HOST}")
            return connexion
        except Exception as e:
            print(f"[AMQP] Tentative {tentative}/10 echouee : {e}")
            if tentative < 10:
                time.sleep(2)

    print("[AMQP] Impossible de se connecter apres 10 tentatives.")
    raise ConnectionError("Connexion AMQP impossible")


def valider_message(donnees):
    """
    Verifie si les donnees du capteur sont dans la plage valide.
    Retourne (True, None) si valide, (False, raison) si invalide.
    """
    type_capteur = donnees.get("sensor")
    valeur = donnees.get("value")

    if type_capteur == "mouvement":
        # Le mouvement doit etre un booleen
        if isinstance(valeur, bool):
            return True, None
        return False, f"doit etre un booleen, recu: {valeur}"

    if type_capteur in PLAGES_VALIDES:
        minimum, maximum = PLAGES_VALIDES[type_capteur]
        if minimum <= valeur <= maximum:
            return True, None
        return False, f"hors plage {minimum} a {maximum}"

    # Type de capteur inconnu : on considere invalide
    return False, f"type de capteur inconnu: {type_capteur}"


def callback(channel, method, properties, body):
    """
    Callback appele pour chaque message recu.
    Valide les donnees et les transmet ou les rejette.
    """
    try:
        donnees = json.loads(body)
    except json.JSONDecodeError:
        print(f"[INVALIDE] Message non-JSON recu: {body}")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        return

    type_capteur = donnees.get("sensor", "inconnu")
    piece = donnees.get("room", "inconnue")
    valeur = donnees.get("value")

    # Valider les donnees
    est_valide, raison = valider_message(donnees)

    if est_valide:
        # Republier sur l'exchange "validated" avec la meme routing key
        channel.basic_publish(
            exchange="validated",
            routing_key=method.routing_key,
            body=body
        )
        print(f"[VALIDE]   {type_capteur} {piece}: {valeur}")
        channel.basic_ack(delivery_tag=method.delivery_tag)
    else:
        # Rejeter le message sans requeue
        unite = ""
        if type_capteur == "temperature":
            unite = "°C"
        elif type_capteur == "humidite":
            unite = "%"

        print(f"[INVALIDE] {type_capteur} {piece}: {valeur}{unite} ({raison})")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    """Point d'entree : configure la connexion et lance la consommation."""
    connexion = connecter_amqp()
    canal = connexion.channel()

    # Declarer l'exchange "validated" de type topic
    canal.exchange_declare(exchange="validated", exchange_type="topic", durable=False)

    # Declarer une queue auto-generee et la lier a amq.topic avec le binding maison.#
    result = canal.queue_declare(queue="", exclusive=True)
    nom_queue = result.method.queue
    canal.queue_bind(exchange="amq.topic", queue=nom_queue, routing_key="maison.#")

    # Activer le manual ack (auto_ack=False)
    canal.basic_consume(queue=nom_queue, on_message_callback=callback, auto_ack=False)

    print("[AMQP] Service Validation demarre. En attente de messages...")
    print("[AMQP] Binding : amq.topic -> maison.#")
    print()

    try:
        canal.start_consuming()
    except KeyboardInterrupt:
        print("\n[AMQP] Arret du service Validation.")
        canal.stop_consuming()
        connexion.close()


if __name__ == "__main__":
    main()
