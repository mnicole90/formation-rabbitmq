# Formation RabbitMQ & IoT

Formation de 13 heures (4 sessions) sur **RabbitMQ** dans un contexte **IoT et domotique**, destinee a des etudiants B1 (BAC+1).

L'objectif est de comprendre les principes du messaging asynchrone, de manipuler RabbitMQ et de l'appliquer a des scenarios concrets lies a l'Internet des Objets.

## Prerequis

- Savoir utiliser un **terminal / ligne de commande**
- **Docker Desktop** installe et fonctionnel
- **Git** installe (savoir faire `git clone` et `git pull`)
- Connaitre les bases d'au moins un langage (**Python** ou **JavaScript**) ou etre pret a utiliser **Node-RED**

## Installation

```bash
git clone <url-du-repo>
cd formation-rabbitmq
docker compose up -d
```

## Acces Management UI

Une fois les conteneurs demarres, ouvrez votre navigateur a l'adresse suivante :

**http://localhost:15672**

Identifiants par defaut : `guest` / `guest`

## Structure du cours

| Session | Contenu |
|---------|---------|
| Session 1 | Decouverte de RabbitMQ : concepts fondamentaux, premier producer/consumer |
| Session 2 | Exchanges, routing et patterns de communication avances |
| Session 3 | RabbitMQ et IoT : integration MQTT, capteurs et actionneurs |
| Session 4 | Projet final : mise en place d'un systeme domotique complet |
