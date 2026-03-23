# Coup de pouce #3 — Configuration des permissions

## Via le Management UI (interface web)

Ouvrez http://localhost:15672 et connectez-vous avec `guest` / `guest`.

### Etape 1 : Créer les utilisateurs

Allez dans l'onglet **Admin** > **Users** :

1. **Créer l'utilisateur capteur :**
   - Username : `capteur-user`
   - Password : `capteur123`
   - Tags : laisser vide (pas de tag admin)
   - Cliquer sur **Add user**

2. **Créer l'utilisateur dashboard :**
   - Username : `dashboard-user`
   - Password : `dashboard123`
   - Tags : `monitoring` (pour accéder au Management UI en lecture seule)
   - Cliquer sur **Add user**

### Etape 2 : Définir les permissions

Cliquez sur le nom de chaque utilisateur pour accéder a ses permissions.

**Pour `capteur-user` (write-only) :**

| Champ | Valeur | Signification |
|-------|--------|---------------|
| Virtual Host | `/` | Le vhost par défaut |
| Configure | `^$` | Aucun droit de configuration |
| Write | `.*` | Peut écrire sur tous les exchanges |
| Read | `^$` | Aucun droit de lecture |

**Pour `dashboard-user` (read-only) :**

| Champ | Valeur | Signification |
|-------|--------|---------------|
| Virtual Host | `/` | Le vhost par défaut |
| Configure | `^$` | Aucun droit de configuration |
| Write | `^$` | Aucun droit d'écriture |
| Read | `.*` | Peut lire toutes les queues |

> `^$` est une expression régulière qui ne matche rien (chaîne vide uniquement). C'est la façon de dire "aucune permission" dans RabbitMQ.

### Etape 3 : Vérifier

Dans la liste des utilisateurs, vous devriez voir :

- `capteur-user` — permissions : configure=`^$`, write=`.*`, read=`^$`
- `dashboard-user` — permissions : configure=`^$`, write=`^$`, read=`.*`

---

## Via la ligne de commande (rabbitmqctl)

Si vous préférez la CLI, exécutez ces commandes dans le conteneur RabbitMQ :

```bash
# Entrer dans le conteneur
docker exec -it rabbitmq bash

# Créer les utilisateurs
rabbitmqctl add_user capteur-user capteur123
rabbitmqctl add_user dashboard-user dashboard123

# Donner le tag monitoring au dashboard (optionnel, pour le Management UI)
rabbitmqctl set_user_tags dashboard-user monitoring

# Définir les permissions
# Syntaxe : set_permissions <user> <configure> <write> <read>
rabbitmqctl set_permissions -p / capteur-user "^$" ".*" "^$"
rabbitmqctl set_permissions -p / dashboard-user "^$" "^$" ".*"

# Vérifier
rabbitmqctl list_permissions
```

---

## Modifier le code pour utiliser les nouveaux utilisateurs

### Python (pika)

```python
import pika

# Pour un capteur (write-only)
credentials = pika.PlainCredentials('capteur-user', 'capteur123')
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        host='localhost',
        credentials=credentials
    )
)
channel = connection.channel()

# Publier un message — OK, capteur-user a le droit d'écriture
channel.basic_publish(
    exchange='amq.topic',
    routing_key='maison.cuisine.fumee',
    body='{"sensor": "fumee", "value": 42, "room": "cuisine"}'
)

# Tenter de consommer — ERREUR, capteur-user n'a pas le droit de lecture
# channel.basic_consume(queue='ma-queue', on_message_callback=callback)
# ^^^ Ceci va provoquer une erreur ACCESS_REFUSED
```

```python
import pika

# Pour le dashboard (read-only)
credentials = pika.PlainCredentials('dashboard-user', 'dashboard123')
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        host='localhost',
        credentials=credentials
    )
)
channel = connection.channel()

# Consommer des messages — OK, dashboard-user a le droit de lecture
channel.basic_consume(
    queue='alerts-queue',
    on_message_callback=lambda ch, method, props, body: print(f"Reçu : {body}"),
    auto_ack=False
)
channel.start_consuming()
```

### Node.js (amqplib)

```javascript
const amqp = require('amqplib');

// Pour un capteur (write-only)
async function startCapteur() {
  const connection = await amqp.connect(
    'amqp://capteur-user:capteur123@localhost:5672'
  );
  const channel = await connection.createChannel();

  // Publier un message — OK
  channel.publish(
    'amq.topic',
    'maison.cuisine.fumee',
    Buffer.from(JSON.stringify({
      sensor: 'fumee',
      value: 42,
      room: 'cuisine'
    }))
  );
}

// Pour le dashboard (read-only)
async function startDashboard() {
  const connection = await amqp.connect(
    'amqp://dashboard-user:dashboard123@localhost:5672'
  );
  const channel = await connection.createChannel();

  // Consommer des messages — OK
  channel.consume('alerts-queue', (msg) => {
    console.log('Reçu :', msg.content.toString());
    channel.ack(msg); // Acknowledgement manuel
  });
}
```

---

## Tester les permissions (pour la démo)

Pour prouver que les permissions fonctionnent, montrez ceci pendant votre démo :

1. Lancez votre capteur avec `capteur-user` : les messages sont publiés correctement
2. Tentez de **lire** une queue avec `capteur-user` : vous obtenez une erreur `ACCESS_REFUSED`
3. Lancez votre dashboard avec `dashboard-user` : les messages sont reçus correctement
4. Tentez de **publier** avec `dashboard-user` : vous obtenez une erreur `ACCESS_REFUSED`

L'erreur ressemble a ceci dans les logs :

```
ACCESS_REFUSED - access to queue 'alerts-queue' in vhost '/' refused for user 'capteur-user'
```

C'est exactement ce qu'on veut voir : la preuve que RabbitMQ bloque les opérations non autorisées.
