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

> **Note** : le code PHP declare aussi l'exchange automatiquement. Mais c'est bien de le voir dans l'interface pour comprendre ce qu'on fait.

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
docker compose exec php php /app/session-2/php/producer_topic.php
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
# Terminal 1 - Alertes (manual ack)
docker compose exec php php /app/session-2/php/consumer_alertes.php

# Terminal 2 - Monitoring (manual ack)
docker compose exec php php /app/session-2/php/consumer_monitoring.php

# Terminal 3 - Salon (auto ack)
docker compose exec php php /app/session-2/php/consumer_salon.php
```

2. Ouvrir un **4eme terminal** et lancer le producer :

```bash
docker compose exec php php /app/session-2/php/producer_topic.php
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

```php
$connection = new AMQPStreamConnection('localhost', 5672, 'capteur-user', 'capteur123');
```

2. Lancer le producer → ca marche, il peut publier !

3. **Tester l'interdit** : essayer de consommer avec `capteur-user` :

```php
$connection = new AMQPStreamConnection('localhost', 5672, 'capteur-user', 'capteur123');
$channel = $connection->channel();
$channel->basic_consume($queue_name, '', false, true, false, false, $callback);
```

4. Resultat attendu : **ACCESS_REFUSED** ! C'est normal, `capteur-user` n'a pas le droit de lire.

> **Conclusion** : les permissions RabbitMQ permettent de limiter ce que chaque application peut faire. Un capteur ne devrait pas pouvoir lire les messages, et un dashboard ne devrait pas pouvoir en envoyer.

### Partie B : Auto Ack vs Manual Ack — Comparaison en direct

Nos consumers de l'exercice 1 sont deja configures differemment pour illustrer les deux modes :

| Consumer | Mode | Fichier |
|----------|------|---------|
| **consumer_salon.php** | `auto_ack=true` | Le message est supprime de la queue **des qu'il est envoye** au consumer |
| **consumer_alertes.php** | `manual ack` | Le message reste dans la queue **tant que le consumer n'a pas appele `$msg->ack()`** |

Les deux consumers ont un `sleep(3)` qui simule un traitement long. C'est pendant ces 3 secondes que vous allez tuer le consumer pour voir la difference.

#### Experience 1 : auto_ack — le message est PERDU

1. Lancer le consumer salon :

```bash
docker compose exec php php /app/session-2/php/consumer_salon.php
```

2. Dans un autre terminal, envoyer un message :

```bash
docker compose exec php php /app/session-2/php/producer_topic.php
```

3. Des que vous voyez `→ Traitement en cours...` dans le consumer salon, **tuez-le immediatement avec Ctrl+C** (avant `→ Traitement termine !`)

4. Verifiez dans le Management UI → onglet **Queues** → queue `salon` :
   - **Messages Ready : 0** — le message a disparu !
   - Il est perdu a jamais. Le consumer n'a pas eu le temps de finir son traitement.

5. Relancez le consumer salon :

```bash
docker compose exec php php /app/session-2/php/consumer_salon.php
```

6. Resultat : **rien ne se passe**. Le message ne revient pas.

> **Pourquoi ?** Avec `auto_ack=true`, RabbitMQ supprime le message de la queue **immediatement** apres l'avoir envoye. Il ne sait pas si le consumer a reellement termine le traitement.

#### Experience 2 : manual ack — le message est PRESERVE

1. Lancer le consumer alertes :

```bash
docker compose exec php php /app/session-2/php/consumer_alertes.php
```

2. Envoyer un message de fumee avec le producer (attendre qu'il envoie `maison.cuisine.fumee`)

3. Des que vous voyez `→ Traitement en cours...` dans le consumer alertes, **tuez-le immediatement avec Ctrl+C** (avant `→ Traitement termine !`)

4. Verifiez dans le Management UI → onglet **Queues** → queue `alertes` :
   - **Messages Ready : 1** — le message est toujours la !
   - RabbitMQ l'a remis dans la queue parce que le consumer n'a pas envoye son ack.

5. Relancez le consumer alertes :

```bash
docker compose exec php php /app/session-2/php/consumer_alertes.php
```

6. Resultat : **le message est re-delivre !** Le consumer le recoit a nouveau et peut le traiter correctement.

> **Pourquoi ?** Avec `manual ack` (no_ack=false), RabbitMQ attend l'appel a `$msg->ack()` avant de supprimer le message. Si le consumer plante avant l'ack, le message retourne dans la queue et sera redistribue.

#### Resume : quand utiliser quoi ?

| Critere | Auto Ack | Manual Ack |
|---------|----------|------------|
| **Fiabilite** | Faible — message perdu si crash | Forte — message re-delivre si crash |
| **Performance** | Plus rapide (pas d'aller-retour ack) | Legerement plus lent |
| **Quand l'utiliser** | Logs non critiques, metriques jetables | Alertes, commandes, donnees importantes |
| **En production** | Rarement | Presque toujours |

#### Le code cle : la difference en PHP

```php
// === AUTO ACK (consumer_salon.php) ===
// Le 4eme parametre (true) = no_ack = on ne demande pas d'ack
$channel->basic_consume('salon', '', false, true, false, false, $callback);
// Dans le callback : PAS de $msg->ack()

// === MANUAL ACK (consumer_alertes.php) ===
// Le 4eme parametre (false) = on demande un ack explicite
$channel->basic_consume('alertes', '', false, false, false, false, $callback);
// Dans le callback : $msg->ack() APRES le traitement
```

> **Regle d'or** : en production, utilisez **toujours** le manual ack pour les messages importants. Le cout en performance est negligeable face au risque de perte de donnees. Imaginez perdre une alerte incendie parce que le consumer a plante...

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

```php
$callback = function ($msg) {
    $data = json_decode($msg->getBody(), true);
    $niveau = $data['value'] ?? 0;

    if ($niveau > 80) {
        echo "[CRITIQUE] Niveau trop eleve : $niveau — rejet vers DLQ\n";
        $msg->nack(false); // requeue=false → envoye vers la DLQ
    } else {
        echo "[OK] Niveau normal : $niveau\n";
        $msg->ack();
    }
};
```

#### Etape 4 : Verifier

1. Envoyer un message avec un niveau de fumee > 80
2. Le consumer le rejette avec `nack(false)`
3. Aller dans le Management UI → onglet **Queues** → `dead-letters`
4. Le message rejete est la !

> **A retenir** : la DLQ permet de ne jamais perdre un message, meme quand il est rejete. On peut ensuite analyser ces messages pour comprendre ce qui s'est passe.
