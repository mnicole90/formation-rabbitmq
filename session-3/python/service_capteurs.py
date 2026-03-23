#!/usr/bin/env python3
"""
Service Capteurs — Publie des donnees de capteurs IoT via MQTT.

Ce service simule 4 types de capteurs (temperature, humidite, mouvement, fumee)
repartis dans differentes pieces de la maison. Il publie les donnees sur des
topics MQTT de la forme maison/{piece}/{type}.

Parfois, des valeurs aberrantes sont envoyees pour tester le service de validation.
"""

import json
import random
import time
from datetime import datetime

import paho.mqtt.client as mqtt

# Configuration MQTT
MQTT_HOST = "localhost"
MQTT_PORT = 1883
MQTT_USER = "guest"
MQTT_PASS = "guest"

# Pieces de la maison
PIECES = ["salon", "cuisine", "chambre", "entree"]

# Types de capteurs
TYPES_CAPTEURS = ["temperature", "humidite", "mouvement", "fumee"]


def generer_valeur(type_capteur):
    """
    Genere une valeur pour un capteur donne.
    5% de chance d'envoyer une valeur aberrante pour temperature et fumee.
    """
    if type_capteur == "temperature":
        # 5% de chance d'envoyer une valeur aberrante (999)
        if random.random() < 0.05:
            return 999
        return round(random.uniform(15, 40), 1)

    elif type_capteur == "humidite":
        return round(random.uniform(30, 80), 1)

    elif type_capteur == "mouvement":
        return random.choice([True, False])

    elif type_capteur == "fumee":
        # 5% de chance d'envoyer une valeur elevee (95+)
        if random.random() < 0.05:
            return round(random.uniform(95, 100), 1)
        return round(random.uniform(0, 100), 1)


def connecter_mqtt():
    """
    Se connecte au broker MQTT avec logique de retry.
    Tente 10 fois avec un delai de 2 secondes entre chaque tentative.
    """
    client = mqtt.Client()
    client.username_pw_set(MQTT_USER, MQTT_PASS)

    for tentative in range(1, 11):
        try:
            client.connect(MQTT_HOST, MQTT_PORT)
            print(f"[MQTT] Connecte a {MQTT_HOST}:{MQTT_PORT}")
            return client
        except Exception as e:
            print(f"[MQTT] Tentative {tentative}/10 echouee : {e}")
            if tentative < 10:
                time.sleep(2)

    print("[MQTT] Impossible de se connecter apres 10 tentatives.")
    raise ConnectionError("Connexion MQTT impossible")


def main():
    """Boucle principale : genere et publie des donnees de capteurs."""
    client = connecter_mqtt()

    print("[MQTT] Service Capteurs demarre. Ctrl+C pour arreter.")
    print()

    try:
        while True:
            # Choisir un capteur et une piece au hasard
            type_capteur = random.choice(TYPES_CAPTEURS)
            piece = random.choice(PIECES)

            # Generer la valeur
            valeur = generer_valeur(type_capteur)

            # Construire le message JSON
            message = {
                "sensor": type_capteur,
                "value": valeur,
                "room": piece,
                "timestamp": datetime.now().isoformat()
            }

            # Construire le topic MQTT
            topic = f"maison/{piece}/{type_capteur}"

            # Publier le message
            payload = json.dumps(message)
            client.publish(topic, payload)

            print(f"[MQTT] Publie {topic}: {payload}")

            # Attendre entre 2 et 3 secondes
            time.sleep(random.uniform(2, 3))

    except KeyboardInterrupt:
        print("\n[MQTT] Arret du service Capteurs.")
        client.disconnect()


if __name__ == "__main__":
    main()
