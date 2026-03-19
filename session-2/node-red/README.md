# Node-RED - Topic Exchange Domotique

## Prerequis

- Node-RED installe et lance (http://localhost:1880)
- Le plugin `node-red-contrib-amqp` installe (Menu → Manage palette → Install → chercher `node-red-contrib-amqp`)
- RabbitMQ lance (`docker compose up -d`)

## Importer le flow

1. Ouvrir Node-RED : [http://localhost:1880](http://localhost:1880)
2. Menu (en haut a droite) → **Import**
3. Copier-coller le contenu du fichier `flow-topic-exchange.json`
4. Cliquer sur **Import**
5. Cliquer sur **Deploy**

## Configuration du broker AMQP

Apres l'import, il faut configurer la connexion RabbitMQ dans chaque node AMQP :

1. Double-cliquer sur un node `amqp out` ou `amqp in`
2. A cote de **Broker**, cliquer sur le crayon pour editer
3. Remplir :
   - **Host** : `localhost`
   - **Port** : `5672`
   - **User** : `guest`
   - **Password** : `guest`
4. Cliquer sur **Update** puis **Done**
5. Faire de meme pour les autres nodes AMQP
6. Cliquer sur **Deploy**

## Description du flow

### Producer (envoi de messages)

- Un node **inject** envoie un signal toutes les 3 secondes
- Un node **function** genere des donnees de capteurs aleatoires en alternant entre :
  - `maison.salon.temperature` (15-35°C)
  - `maison.entree.mouvement` (true/false)
  - `maison.cuisine.fumee` (0-100)
- Un node **amqp out** publie le message sur l'exchange `domotique` (type `topic`) avec la routing key dynamique definie dans `msg.routingKey`

### Consumers (reception de messages)

Trois flows de reception avec des bindings differents :

| Flow | Binding Key | Ce qu'il recoit |
|------|-------------|-----------------|
| **Alertes** | `maison.*.fumee` | Messages de fumee uniquement |
| **Monitoring** | `maison.#` | Tous les messages |
| **Salon** | `maison.salon.*` | Messages du salon uniquement |

Chaque flow utilise un node **amqp in** connecte a un node **debug** pour afficher les messages recus dans l'onglet Debug de Node-RED.

## Routing key dynamique

Pour le node **amqp out**, la routing key est definie dynamiquement dans le node function via `msg.routingKey`. Le node amqp out utilise cette propriete pour router le message vers le bon binding.
