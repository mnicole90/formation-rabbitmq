#!/usr/bin/env python3
"""
Service Alertes — Detecte les seuils critiques dans les donnees validees.

Ce service consomme les messages depuis l'exchange "validated" (binding maison.#)
et affiche des alertes formatees selon les seuils definis :
- Temperature > 50°C -> CRITICAL
- Temperature > 35°C -> WARNING
- Fumee > 70 -> CRITICAL
- Fumee > 40 -> WARNING
- Mouvement = true -> INFO
- Humidite -> pas d'alerte

Utilise le manual ack pour garantir le traitement de chaque message.
"""

import json
import time

import pika

# Configuration AMQP
AMQP_HOST = "localhost"
AMQP_USER = "guest"
AMQP_PASS = "guest"


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


def detecter_alerte(donnees):
    """
    Detecte le niveau d'alerte en fonction du type de capteur et de la valeur.
    Retourne (niveau, message) ou None si pas d'alerte.
    """
    type_capteur = donnees.get("sensor")
    valeur = donnees.get("value")
    piece = donnees.get("room", "inconnue")

    if type_capteur == "temperature":
        if valeur > 50:
            return "CRITICAL", f"Temperature {piece}: {valeur}°C"
        elif valeur > 35:
            return "WARNING", f"Temperature {piece}: {valeur}°C"
        return None, None

    elif type_capteur == "fumee":
        if valeur > 70:
            return "CRITICAL", f"Fumee {piece}: {valeur}/100"
        elif valeur > 40:
            return "WARNING", f"Fumee {piece}: {valeur}/100"
        return None, None

    elif type_capteur == "mouvement":
        if valeur is True:
            return "INFO", f"Mouvement detecte: {piece}"
        return None, None

    # Humidite : pas d'alerte
    return None, None


def callback(channel, method, properties, body):
    """
    Callback appele pour chaque message recu.
    Detecte les alertes et les affiche en console.
    """
    try:
        donnees = json.loads(body)
    except json.JSONDecodeError:
        print(f"[ERREUR] Message non-JSON recu: {body}")
        channel.basic_ack(delivery_tag=method.delivery_tag)
        return

    niveau, message = detecter_alerte(donnees)

    if niveau is not None:
        # Formater l'affichage avec un alignement
        if niveau == "CRITICAL":
            print(f"[CRITICAL] {message}")
        elif niveau == "WARNING":
            print(f"[WARNING]  {message}")
        elif niveau == "INFO":
            print(f"[INFO]     {message}")

    # Toujours acquitter le message (meme sans alerte)
    channel.basic_ack(delivery_tag=method.delivery_tag)


def main():
    """Point d'entree : configure la connexion et lance la consommation."""
    connexion = connecter_amqp()
    canal = connexion.channel()

    # Declarer l'exchange "validated" (au cas ou il n'existe pas encore)
    canal.exchange_declare(exchange="validated", exchange_type="topic", durable=False)

    # Declarer une queue auto-generee et la lier a l'exchange "validated"
    result = canal.queue_declare(queue="", exclusive=True)
    nom_queue = result.method.queue
    canal.queue_bind(exchange="validated", queue=nom_queue, routing_key="maison.#")

    # Activer le manual ack
    canal.basic_consume(queue=nom_queue, on_message_callback=callback, auto_ack=False)

    print("[AMQP] Service Alertes demarre. En attente de messages...")
    print("[AMQP] Binding : validated -> maison.#")
    print()

    try:
        canal.start_consuming()
    except KeyboardInterrupt:
        print("\n[AMQP] Arret du service Alertes.")
        canal.stop_consuming()
        connexion.close()


if __name__ == "__main__":
    main()
