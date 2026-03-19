# Session 2 - TP : Routing, Securite et Fiabilite

## Prerequis

- Avoir fait la Session 1 (producer/consumer avec queue par defaut)
- Docker et RabbitMQ lances (`docker compose up -d`)
- Acces au Management UI : [http://localhost:15672](http://localhost:15672) (guest / guest)

---

## Exercice 1 — Routing avec Topic Exchange (50 min)

### Introduction

En Session 1, on envoyait les messages dans une queue par defaut. C'est simple mais limite : tous les messages vont au meme endroit.

Maintenant, on va **router les messages intelligemment** avec un **Topic Exchange**. L'idee : un capteur publie un message avec une **routing key** (ex : `maison.salon.temperature`), et chaque consumer s'abonne uniquement aux messages qui l'interessent.

### Etape 1 : Creer le Topic Exchange "domotique"

1. Ouvrir le Management UI : [http://localhost:15672](http://localhost:15672)
2. Aller dans l'onglet **Exchanges**
3. En bas de la page, section **Add a new exchange** :
   - **Name** : `domotique`
   - **Type** : `topic`
   - Laisser les autres options par defaut
4. Cliquer sur **Add exchange**

> **Note** : le code Python et Node.js declare aussi l'exchange automatiquement. Mais c'est bien de le voir dans l'interface pour comprendre ce qu'on fait.

### Etape 2 : Le Producer (simulateur de capteurs)

Le producer simule **3 capteurs** qui publient des messages avec des routing keys differentes :

| Routing Key | Capteur | Valeur |
|-------------|---------|--------|
| `maison.salon.temperature` | Thermometre du salon | Aleatoire entre 15 et 35°C |
| `maison.entree.mouvement` | Detecteur de mouvement de l'entree | `true` ou `false` aleatoire |
| `maison.cuisine.fumee` | Detecteur de fumee de la cuisine | Niveau aleatoire entre 0 et 100 |

Chaque message est envoye en JSON avec le nom du capteur, la valeur, la piece et un timestamp.

**Lancer le producer :**

```bash
# Python
cd session-2/python
pip install -r requirements.txt
python producer_topic.py

# OU Node.js
cd session-2/nodejs
npm install
node producer_topic.js
```

### Etape 3 : Les 3 Consumers

On va creer **3 consumers** qui s'abonnent chacun a des messages differents grace aux **binding keys** :

| Consumer | Binding Key | Ce qu'il recoit |
|----------|-------------|-----------------|
| **alertes** | `maison.*.fumee` | Uniquement les messages de fumee, **quelle que soit la piece** |
| **monitoring** | `maison.#` | **TOUS** les messages de la maison |
| **salon** | `maison.salon.*` | Uniquement les messages **du salon** (tous capteurs) |

**Rappel wildcards :**
- `*` remplace **exactement un mot** → `maison.*.fumee` matche `maison.cuisine.fumee` mais pas `maison.fumee`
- `#` remplace **zero ou plusieurs mots** → `maison.#` matche tout ce qui commence par `maison.`

### Etape 4 : Lancer et verifier

1. Ouvrir **3 terminaux** et lancer chaque consumer :

```bash
# Terminal 1 - Alertes
python consumer_alertes.py

# Terminal 2 - Monitoring
python consumer_monitoring.py

# Terminal 3 - Salon
python consumer_salon.py
```

2. Ouvrir un **4eme terminal** et lancer le producer :

```bash
python producer_topic.py
```

3. Observer qui recoit quoi !

### Tableau de verification

| Message envoye | Routing Key | alertes | monitoring | salon |
|----------------|-------------|---------|------------|-------|
| Temperature salon 22°C | `maison.salon.temperature` | | ✅ | ✅ |
| Mouvement entree true | `maison.entree.mouvement` | | ✅ | |
| Fumee cuisine niveau 75 | `maison.cuisine.fumee` | ✅ | ✅ | |

> **A retenir** : le consumer "monitoring" recoit tout grace a `maison.#`. Le consumer "alertes" ne recoit que la fumee. Le consumer "salon" ne recoit que ce qui vient du salon.

---

## Exercice 2 — Securite et Fiabilite (40 min)

### Partie A : Gestion des utilisateurs et permissions

En production, on n'utilise **jamais** le compte `guest`. On va creer des utilisateurs avec des permissions specifiques.

#### Etape 1 : Creer les utilisateurs

1. Ouvrir le Management UI → onglet **Admin**
2. Section **Add a user** :

| Utilisateur | Mot de passe | Tags |
|-------------|-------------|------|
| `capteur-user` | `capteur123` | (aucun tag) |
| `dashboard-user` | `dashboard123` | (aucun tag) |

3. Cliquer sur **Add user** pour chacun

#### Etape 2 : Configurer les permissions

Cliquer sur le nom de chaque utilisateur pour configurer ses permissions sur le virtual host `/` :

**capteur-user** (peut ecrire, pas lire) :
- **Configure** : (vide)
- **Write** : `domotique`
- **Read** : (vide)

> Cela signifie que `capteur-user` peut publier sur l'exchange "domotique" mais ne peut pas consommer de messages.

**dashboard-user** (peut lire, pas ecrire) :
- **Configure** : `.*`
- **Write** : (vide)
- **Read** : `.*`

> Cela signifie que `dashboard-user` peut consommer des messages mais ne peut pas publier.

#### Etape 3 : Tester les permissions

1. **Modifier le producer** pour utiliser `capteur-user` au lieu de `guest` :

```python
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        'localhost',
        credentials=pika.PlainCredentials('capteur-user', 'capteur123')
    )
)
```

2. Lancer le producer → ca marche, il peut publier !

3. **Tester l'interdit** : essayer de consommer avec `capteur-user` :

```python
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        'localhost',
        credentials=pika.PlainCredentials('capteur-user', 'capteur123')
    )
)
channel = connection.channel()
channel.basic_consume(queue='ma-queue', on_message_callback=callback)
```

4. Resultat attendu : **ACCESS_REFUSED** ! C'est normal, `capteur-user` n'a pas le droit de lire.

> **Conclusion** : les permissions RabbitMQ permettent de limiter ce que chaque application peut faire. Un capteur ne devrait pas pouvoir lire les messages, et un dashboard ne devrait pas pouvoir en envoyer.

### Partie B : Acquittement manuel (Manual Ack)

Jusqu'ici, on utilisait `auto_ack=True` : le message est supprime de la queue des qu'il est envoye au consumer. Mais que se passe-t-il si le consumer plante avant de traiter le message ? Le message est perdu !

#### Etape 1 : Passer en manual ack

Modifier un consumer (par exemple `consumer_monitoring.py`) :

```python
# AVANT (auto_ack)
channel.basic_consume(
    queue=queue_name,
    on_message_callback=callback,
    auto_ack=True
)

# APRES (manual ack)
def callback(ch, method, properties, body):
    message = json.loads(body)
    print(f"[{method.routing_key}] {message}")
    # On acquitte manuellement APRES le traitement
    ch.basic_ack(delivery_tag=method.delivery_tag)

channel.basic_consume(
    queue=queue_name,
    on_message_callback=callback,
    auto_ack=False  # <-- important !
)
```

#### Etape 2 : Test de fiabilite

1. Lancer le consumer modifie
2. Envoyer un message avec le producer
3. **Tuer le consumer** avec Ctrl+C **AVANT** qu'il ait le temps d'ack
4. Relancer le consumer
5. **Le message revient !** RabbitMQ l'a remis dans la queue parce qu'il n'a pas ete acquitte.

> **A retenir** : avec `auto_ack=False`, RabbitMQ attend la confirmation du consumer. Si le consumer plante, le message est redistribue a un autre consumer (ou au meme quand il redemarrera).

### Partie C : Bonus — Dead Letter Queue (DLQ)

Une Dead Letter Queue recoit les messages qui ont ete **rejetes** ou qui ont **expire**. C'est utile pour analyser les erreurs sans perdre les messages.

#### Etape 1 : Creer la DLQ dans le Management UI

1. Onglet **Queues** → **Add a new queue**
2. Creer la queue `dead-letters` (options par defaut)

#### Etape 2 : Creer une queue avec redirection vers la DLQ

1. Creer une nouvelle queue `alertes-avec-dlq`
2. Dans **Arguments**, ajouter :
   - `x-dead-letter-exchange` : (vide, pour utiliser l'exchange par defaut)
   - `x-dead-letter-routing-key` : `dead-letters`

3. Binder cette queue a l'exchange `domotique` avec la binding key `maison.*.fumee`

#### Etape 3 : Rejeter un message

```python
def callback(ch, method, properties, body):
    message = json.loads(body)
    niveau = message.get('value', 0)

    if niveau > 80:
        print(f"[CRITIQUE] Niveau trop eleve : {niveau} — rejet vers DLQ")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    else:
        print(f"[OK] Niveau normal : {niveau}")
        ch.basic_ack(delivery_tag=method.delivery_tag)
```

#### Etape 4 : Verifier

1. Envoyer un message avec un niveau de fumee > 80
2. Le consumer le rejette avec `basic_nack(requeue=False)`
3. Aller dans le Management UI → onglet **Queues** → `dead-letters`
4. Le message rejete est la !

> **A retenir** : la DLQ permet de ne jamais perdre un message, meme quand il est rejete. On peut ensuite analyser ces messages pour comprendre ce qui s'est passe.
