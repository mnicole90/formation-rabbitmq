# Node-RED — Capteur de température avec RabbitMQ

Ce guide explique comment utiliser Node-RED pour créer un flux visuel qui publie et consomme des messages RabbitMQ.

## 1. Installer Node-RED

### Option A — Installation globale avec npm

```bash
npm install -g node-red
```

Puis lancez Node-RED :

```bash
node-red
```

### Option B — Avec Docker

```bash
docker run -it -p 1880:1880 nodered/node-red
```

Dans les deux cas, Node-RED sera accessible sur [http://localhost:1880](http://localhost:1880).

## 2. Installer le plugin RabbitMQ

1. Ouvrez Node-RED dans votre navigateur : [http://localhost:1880](http://localhost:1880)
2. Cliquez sur le **menu hamburger** (en haut a droite, icone avec 3 traits)
3. Sélectionnez **Manage palette**
4. Allez dans l'onglet **Install**
5. Dans le champ de recherche, tapez `node-red-contrib-amqp`
6. Cliquez sur **Install** a cote du paquet `node-red-contrib-amqp`
7. Confirmez l'installation

Une fois installé, vous verrez de nouveaux noeuds dans la palette de gauche, dans la catégorie **amqp**.

## 3. Importer le flow

Un flow pret a l'emploi est fourni dans le fichier `flow-capteur.json`.

Pour l'importer :

1. Cliquez sur le **menu hamburger**
2. Sélectionnez **Import**
3. Cliquez sur **select a file to import** ou collez directement le contenu du fichier `flow-capteur.json`
4. Cliquez sur **Import**
5. Le flow apparait sur votre espace de travail

## 4. Configurer la connexion RabbitMQ

Avant de déployer le flow, vous devez configurer le serveur RabbitMQ :

1. Double-cliquez sur le noeud **amqp out** (celui qui publie)
2. A cote de **Broker**, cliquez sur l'icone de crayon pour ajouter un serveur
3. Remplissez les champs :
   - **Host** : `localhost`
   - **Port** : `5672`
   - **User** : `guest`
   - **Password** : `guest`
4. Cliquez sur **Add** puis **Done**
5. Faites la meme chose pour le noeud **amqp in** (celui qui consomme) en sélectionnant le meme serveur

## 5. Déployer et tester

1. Cliquez sur le bouton **Deploy** (en haut a droite)
2. Le flow démarre automatiquement :
   - Le noeud **inject** envoie un signal toutes les 5 secondes
   - Le noeud **function** génere les données de température aléatoires (entre 15 et 35°C)
   - Le noeud **amqp out** publie le message JSON sur la queue `capteurs`
   - Le noeud **amqp in** consomme les messages de la queue `capteurs`
   - Le noeud **debug** affiche les messages recus dans l'onglet Debug (icone insecte a droite)

## 6. Description du flow

Le flow contient deux parties :

### Producer (ligne du haut)
- **inject** : déclenche l'envoi toutes les 5 secondes (configurable)
- **Generer temperature** : noeud function qui crée un message JSON avec une température aléatoire
- **amqp out** : publie le message sur la queue `capteurs`

### Consumer (ligne du bas)
- **amqp in** : écoute la queue `capteurs` et recoit les messages
- **debug** : affiche le contenu du message dans l'onglet Debug de Node-RED
