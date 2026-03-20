# Session 3 — RabbitMQ et IoT : integration MQTT et microservices

## Objectifs de la session

- Activer et utiliser le protocole MQTT avec RabbitMQ
- Comprendre la passerelle MQTT <-> AMQP integree a RabbitMQ
- Construire une architecture microservices avec 3 services qui communiquent via RabbitMQ

---

## Exercice 1 — Activer MQTT (30 min)

### Etape 1 : Arreter le Docker actuel

```bash
docker compose down
```

### Etape 2 : Relancer avec le plugin MQTT

On utilise un fichier **docker-compose override** qui ajoute le plugin MQTT et expose le port 1883 :

```bash
docker compose -f docker-compose.yml -f session-3/docker-compose.mqtt.yml up -d
```

### Etape 3 : Verifier dans le Management UI

Ouvrez **http://localhost:15672** (identifiants : `guest` / `guest`).

Dans l'onglet **Overview**, verifiez que le protocole MQTT apparait dans la section **Ports and contexts** ou **Protocols**. Vous devriez voir le port `1883` pour MQTT.

### Etape 4 : Installer les dependances PHP

```bash
cd session-3/php && composer install
```

Cela installe les librairies :
- `php-amqplib/php-amqplib` — client AMQP pour communiquer avec RabbitMQ
- `php-mqtt/client` — client MQTT pour publier sur le broker

**Ou avec mosquitto (outil en ligne de commande) :**
```bash
# macOS
brew install mosquitto

# Linux (Debian/Ubuntu)
apt install mosquitto-clients
```

### Etape 5 : Tester la passerelle MQTT -> AMQP

Publiez un message MQTT avec mosquitto :

```bash
mosquitto_pub -h localhost -t "maison/salon/temperature" -m '{"sensor":"temperature","value":22.5,"room":"salon"}'
```

Ou lancez directement le service capteurs PHP (voir Exercice 2).

Maintenant, observez dans le **Management UI** :

1. Allez dans l'onglet **Exchanges** et cliquez sur `amq.topic`
2. Le message est arrive dans cet exchange
3. La routing key est `maison.salon.temperature` (les `/` MQTT sont convertis en `.` AMQP automatiquement par RabbitMQ)

> **Point cle** : RabbitMQ fait le pont entre MQTT et AMQP de maniere transparente. Un producteur MQTT peut envoyer des messages qu'un consommateur AMQP recevra, et inversement.

Si vous avez encore un consumer AMQP de la Session 2, lancez-le avec un binding sur `amq.topic` et la routing key `maison.#` pour recevoir les messages MQTT. Le pont MQTT <-> AMQP est valide !

---

## Exercice 2 — Architecture microservices (1h15)

### Objectif

Construire un pipeline de **3 services** qui communiquent uniquement via RabbitMQ :

```
                        MQTT                    AMQP                     AMQP
  +------------------+       +------------+            +--------------+        +----------------+
  | Service Capteurs | ----> | amq.topic  | ---------> |  Service     | -----> | Exchange       |
  | (MQTT publisher) |       | (exchange) |            |  Validation  |        | "validated"    |
  +------------------+       +------------+            +--------------+        +-------+--------+
                                                                                       |
                                                              +------------------------+
                                                              |
                                                       +------v---------+
                                                       | Service        |
                                                       | Alertes        |
                                                       +----------------+
```

### Service Capteurs (`service_capteurs.php`)

- Publie en **MQTT** des donnees de 4 types de capteurs
- Topics MQTT : `maison/{piece}/{type}`
  - Pieces : `salon`, `cuisine`, `chambre`, `entree`
  - Types : `temperature`, `humidite`, `mouvement`, `fumee`
- Exemples : `maison/salon/temperature`, `maison/cuisine/fumee`
- Message JSON :
  ```json
  {"sensor": "temperature", "value": 22.5, "room": "salon", "timestamp": "2026-03-19T10:30:00"}
  ```
- Publie toutes les **2 a 3 secondes** (aleatoire)
- Parfois envoie des **valeurs aberrantes** (temperature = 999, fumee > 95) pour tester la validation

### Service Validation (`service_validation.php`)

- Consomme en **AMQP** depuis l'exchange `amq.topic` avec le binding `maison.#`
- Verifie la coherence des donnees :
  | Type | Plage valide |
  |------|-------------|
  | Temperature | -20 a 60°C |
  | Humidite | 0 a 100% |
  | Fumee | 0 a 100 |
  | Mouvement | true ou false |
- **Si valide** : republier sur un exchange `validated` (type topic) avec la meme routing key
- **Si invalide** : afficher un log d'erreur et rejeter le message (`basic_nack`, `requeue=false`)
- Utilise le **manual ack** (pas d'auto-ack)

### Service Alertes (`service_alertes.php`)

- Consomme depuis l'exchange `validated` avec le binding `maison.#`
- Detecte les **seuils critiques** :
  | Condition | Niveau |
  |-----------|--------|
  | Temperature > 50°C | CRITICAL |
  | Temperature > 35°C | WARNING |
  | Fumee > 70 | CRITICAL |
  | Fumee > 40 | WARNING |
  | Mouvement = true | INFO |
  | Humidite | (pas d'alerte) |
- Affichage en console :
  ```
  [CRITICAL] Fumee cuisine: 85/100
  [WARNING]  Temperature salon: 38.5°C
  [INFO]     Mouvement detecte: entree
  ```
- Utilise le **manual ack**

### Instructions

Lancez chaque service dans un **terminal separe** :

```bash
# Terminal 1 — Service Capteurs (MQTT)
php session-3/php/service_capteurs.php

# Terminal 2 — Service Validation (AMQP)
php session-3/php/service_validation.php

# Terminal 3 — Service Alertes (AMQP)
php session-3/php/service_alertes.php
```

Vous pouvez aussi tester l'envoi MQTT manuellement avec mosquitto :

```bash
mosquitto_pub -h localhost -t "maison/salon/temperature" -m '{"sensor":"temperature","value":22.5,"room":"salon"}'
```

---

## Exercice 3 — Tests et observation (30 min)

### Etape 1 : Observer le flux

Avec les 3 services lances, ouvrez le **Management UI** (http://localhost:15672) et observez :

- **Onglet Connections** : vous devriez voir les connexions MQTT et AMQP
- **Onglet Queues** : les queues creees par les services
- **Onglet Exchanges** : `amq.topic` et `validated`
- Les **message rates** (messages/s) dans les graphiques

### Etape 2 : Test de panne

1. **Coupez le service Validation** avec `Ctrl+C`
2. Observez dans le Management UI : les messages du service Capteurs s'accumulent dans la queue
3. **Relancez le service Validation**
4. Observez : les messages accumules sont traites automatiquement (rattrapage)

> **Point cle** : RabbitMQ stocke les messages tant qu'ils ne sont pas consommes. C'est un des grands avantages du messaging asynchrone : la tolerance aux pannes.

### Etape 3 : Observer les donnees invalides

Le service Capteurs envoie parfois `temperature = 999` (5% des cas). Observez :

- Le service Validation affiche `[INVALIDE] temperature salon: 999°C (hors plage -20 a 60)`
- Le message est rejete (`nack`) et ne parvient **jamais** au service Alertes
- Dans le Management UI, le compteur de messages nack augmente

### Etape 4 : Observer les metriques

Dans le Management UI, notez :

- Le **debit de messages** (message rates)
- La **profondeur des queues** (queue depth)
- Le nombre de **connexions** actives

---

## Exercice formatif — Service Stockage

### Objectif

Ajoutez un **4eme service** a l'architecture :

```
                                              +----------------+
                                         +--> | Service        |
                                         |    | Alertes        |
  +------------------+    +-----------+  |    +----------------+
  | Service Capteurs | -> | validated | -+
  +------------------+    +-----------+  |    +----------------+
         |                               +--> | Service        |
         v                                    | Stockage (NEW) |
  +------------------+                        +----------------+
  | Service          |
  | Validation       |
  +------------------+
```

### Consignes

1. Creez un service `service_stockage.php` qui :
   - Se connecte en AMQP a RabbitMQ
   - Consomme depuis l'exchange `validated` avec le binding `maison.#`
   - Ecrit chaque message recu dans un fichier `data/messages.json` (une ligne JSON par message, en mode append)
   - Utilise le manual ack

2. Creez le dossier `data/` s'il n'existe pas

3. Lancez le service dans un 4eme terminal et verifiez que les messages arrivent dans le fichier

**Indice PHP pour ecrire dans un fichier :**

```php
// Créer le dossier data/ s'il n'existe pas
if (!is_dir('data')) {
    mkdir('data', 0755, true);
}

// Écrire dans un fichier JSON (une ligne par message, mode append)
file_put_contents('data/messages.json', json_encode($data) . "\n", FILE_APPEND);
```

### Bonus : Round-Robin

Lancez **2 instances** du service Alertes dans 2 terminaux differents :

```bash
# Terminal A
php session-3/php/service_alertes.php

# Terminal B
php session-3/php/service_alertes.php
```

Observez : chaque instance recoit environ la **moitie des messages**. C'est le **round-robin natif** de RabbitMQ. Quand plusieurs consommateurs ecoutent la meme queue, RabbitMQ distribue les messages de maniere equilibree entre eux.
