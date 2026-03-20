# TP Session 1 — Premiers pas avec RabbitMQ

> **Durée estimée : 1h30**
> **Pré-requis : Docker et Docker Compose installés**

---

## Exercice 1 — Installation et prise en main (30 min)

### 1.1 Lancer RabbitMQ avec Docker Compose

Depuis la racine du projet, lancez RabbitMQ en arrière-plan :

```bash
docker compose up -d
```

Vérifiez que le conteneur est bien démarré :

```bash
docker compose ps
```

Vous devriez voir un conteneur `rabbitmq` avec les ports `5672` et `15672` exposés.

### 1.2 Ouvrir l'interface de management

Ouvrez votre navigateur et accédez à l'interface de management RabbitMQ :

**URL :** [http://localhost:15672](http://localhost:15672)

**Identifiants par défaut :**
- Utilisateur : `guest`
- Mot de passe : `guest`

Vous arrivez sur le tableau de bord principal (Overview). Cette page affiche un résumé de l'état du serveur : nombre de connexions, de channels, de queues, et le débit de messages.

### 1.3 Créer une queue de test

1. Cliquez sur l'onglet **Queues and Streams** dans le menu supérieur
2. Vous voyez la liste des queues existantes (vide pour le moment)
3. En bas de la page, dans la section **Add a new queue** :
   - **Type** : laissez `Classic`
   - **Name** : tapez `test`
   - **Durability** : laissez `Durable` (la queue survivra à un redémarrage de RabbitMQ)
   - Laissez les autres options par défaut
4. Cliquez sur **Add queue**
5. La queue `test` apparaît maintenant dans la liste

### 1.4 Observer les exchanges par défaut

1. Cliquez sur l'onglet **Exchanges** dans le menu supérieur
2. Vous voyez la liste des exchanges créés automatiquement par RabbitMQ :
   - `(AMQP default)` — l'exchange par défaut, de type **direct**. Quand vous publiez un message sans spécifier d'exchange, c'est celui-ci qui est utilisé. Le routing key correspond au nom de la queue.
   - `amq.direct` — exchange de type **direct**
   - `amq.fanout` — exchange de type **fanout** (diffuse à toutes les queues liées)
   - `amq.headers` — exchange de type **headers**
   - `amq.match` — exchange de type **headers** (alias)
   - `amq.topic` — exchange de type **topic** (routage par motif)
   - `amq.rabbitmq.trace` — exchange interne pour le tracing

> **Note :** Nous étudierons les différents types d'exchanges en détail dans la Session 2.

### 1.5 Publier un message manuellement

1. Retournez dans l'onglet **Queues and Streams**
2. Cliquez sur le nom de la queue `test`
3. Vous arrivez sur la page de détail de la queue
4. Dépliez la section **Publish message**
5. Dans le champ **Payload**, tapez un message, par exemple :

```json
{"message": "Bonjour RabbitMQ!", "timestamp": "2026-03-19T10:00:00"}
```

6. Cliquez sur **Publish message**
7. Un bandeau vert confirme : *Message published.*
8. En haut de la page, vous voyez que le compteur **Ready** passe à `1`

### 1.6 Récupérer le message

1. Toujours sur la page de détail de la queue `test`
2. Dépliez la section **Get messages**
3. Laissez **Ack Mode** sur `Nack message requeue true` (le message restera dans la queue)
4. Cliquez sur **Get Message(s)**
5. Le message que vous avez publié s'affiche avec son contenu (payload), ses propriétés et ses headers
6. Vérifiez que le contenu correspond bien à ce que vous avez envoyé

> **Bravo !** Vous venez de publier et consommer votre premier message RabbitMQ via l'interface web. Dans l'exercice suivant, nous allons faire la même chose en code.

---

## Exercice 2 — Premier producer/consumer en code (1h)

L'objectif de cet exercice est de créer :
- Un **producer** qui simule un capteur de température et envoie un message JSON toutes les 5 secondes sur une queue `capteurs`
- Un **consumer** qui écoute cette queue et affiche les messages reçus

Le message JSON envoyé a cette forme :

```json
{
  "sensor": "temperature",
  "value": 22.5,
  "room": "salon",
  "timestamp": "2026-03-19T10:30:00"
}
```

### 2.1 Installer les dépendances

```bash
cd session-1/php
composer install
```

### 2.2 Lancer le consumer et le producer

Ouvrez **deux terminaux** :

**Terminal 1 — Lancer le consumer :**

```bash
php consumer.php
```

Vous devez voir s'afficher : `[*] En attente de messages. CTRL+C pour quitter`

**Terminal 2 — Lancer le producer :**

```bash
php producer.php
```

Le producer envoie un message toutes les 5 secondes. Dans le terminal du consumer, vous verrez apparaître les messages reçus :

```
[salon] Température: 22.5°C
[salon] Température: 28.3°C
...
```

> **Fichiers :** voir `session-1/php/producer.php` et `session-1/php/consumer.php`

### 2.3 Vérification dans l'interface de management

Pendant que le producer et le consumer tournent :

1. Ouvrez [http://localhost:15672](http://localhost:15672)
2. Allez dans l'onglet **Queues and Streams**
3. Vous devez voir la queue `capteurs` avec :
   - Un débit de messages entrants (Publish) et sortants (Deliver/Get)
   - Le nombre de messages en attente (Ready) qui devrait rester proche de 0 si le consumer est actif
4. Cliquez sur la queue pour voir les graphiques en temps réel

---

## Bonus

### Modifier la fréquence d'envoi

Dans le code du producer, modifiez le délai d'envoi :
- **1 seconde** pour un envoi rapide (observez le débit dans le management UI)
- **10 secondes** pour un envoi plus lent

### Ajouter un deuxième capteur

Modifiez le producer pour envoyer également des données d'humidité :
- **Capteur :** `humidity`
- **Valeur :** nombre aléatoire entre 30 et 80 (en %)
- **Room :** `salon`
- Publiez sur la **même queue** `capteurs`

Modifiez le consumer pour afficher correctement les deux types de capteurs :

```
[salon] Temperature: 22.5°C
[salon] Humidite: 65.2%
```

### Observer les métriques

Dans l'interface de management, observez :
- Le **nombre de messages** dans la queue quand vous arrêtez le consumer (les messages s'accumulent)
- Le **débit** (message rate) quand vous relancez le consumer
- La différence entre messages **Ready** (en attente) et **Unacked** (en cours de traitement)
