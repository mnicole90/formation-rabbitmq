# Session 3 — Flow Node-RED Microservices IoT

Ce dossier contient un flow Node-RED pre-configure qui reproduit l'architecture microservices des exercices (Service Capteurs, Service Validation, Service Alertes).

## Pre-requis

Node-RED doit etre lance avec les plugins suivants installes :

- **node-red-contrib-amqp** : pour les nodes `amqp in` et `amqp out`

Le node MQTT (`mqtt in`, `mqtt out`) est inclus par defaut dans Node-RED.

### Installer le plugin AMQP

Dans le menu Node-RED (en haut a droite) :
1. Cliquez sur **Manage palette**
2. Onglet **Install**
3. Recherchez `node-red-contrib-amqp`
4. Cliquez sur **Install**

## Importer le flow

1. Ouvrez Node-RED dans votre navigateur (http://localhost:1880)
2. Menu en haut a droite -> **Import**
3. Cliquez sur **select a file to import**
4. Choisissez le fichier `flow-microservices.json` de ce dossier
5. Cliquez sur **Import**

## Configurer la connexion MQTT

Apres l'import, vous devez configurer le broker MQTT :

1. Double-cliquez sur un node **mqtt out** ou **mqtt in**
2. Cliquez sur le crayon a cote de **Server** pour editer la connexion
3. Renseignez :
   - **Server** : `localhost`
   - **Port** : `1883`
   - Onglet **Security** : Username = `guest`, Password = `guest`
4. Cliquez sur **Update** puis **Done**

## Configurer la connexion AMQP

1. Double-cliquez sur un node **amqp in** ou **amqp out**
2. Cliquez sur le crayon a cote de la connexion pour editer
3. Renseignez :
   - **Host** : `localhost`
   - **Port** : `5672`
   - **User** : `guest`
   - **Password** : `guest`
4. Cliquez sur **Update** puis **Done**

## Description du flow

Le flow est compose de 3 groupes qui correspondent aux 3 services :

### Service Capteurs
- Un node **inject** envoie un signal toutes les 2-3 secondes
- Un node **function** genere des donnees aleatoires de capteurs (temperature, humidite, mouvement, fumee) avec parfois des valeurs aberrantes
- Un node **mqtt out** publie sur le topic `maison/{piece}/{type}`

### Service Validation
- Un node **amqp in** consomme depuis l'exchange `amq.topic` avec le binding `maison.#`
- Un node **function** verifie les plages de valeurs
- Un node **switch** redirige les messages valides vers un **amqp out** (exchange `validated`) et les messages invalides vers un **debug** (affichage en console)

### Service Alertes
- Un node **amqp in** consomme depuis l'exchange `validated` avec le binding `maison.#`
- Un node **function** detecte les seuils critiques et formate les alertes
- Un node **debug** affiche les alertes dans la console Node-RED

## Deployer

Apres avoir configure les connexions et importe le flow :

1. Cliquez sur le bouton **Deploy** en haut a droite
2. Ouvrez l'onglet **Debug** (icone insecte) pour voir les messages
3. Le flow demarre automatiquement
