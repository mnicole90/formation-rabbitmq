# RabbitMQ - Aide-memoire

## Concepts cles

| Concept | Description |
|---------|-------------|
| **Producer** | Application qui envoie des messages a RabbitMQ |
| **Exchange** | Point d'entree des messages, les route vers les queues selon des regles |
| **Queue** | File d'attente qui stocke les messages en attendant qu'ils soient consommes |
| **Consumer** | Application qui recoit et traite les messages depuis une queue |

## Types d'Exchanges

| Type | Description | Cas d'usage |
|------|-------------|-------------|
| **Direct** | Route le message vers la queue dont la binding key correspond exactement a la routing key | Envoi cible a un service precis (ex : logs.error vers le service d'alertes) |
| **Fanout** | Diffuse le message a toutes les queues liees, sans tenir compte de la routing key | Broadcast a tous les consumers (ex : notification globale) |
| **Topic** | Route selon un pattern avec wildcards sur la routing key | Filtrage flexible (ex : capteurs par piece et par type) |

## Routing Keys

- Format : mots separes par des points (`maison.salon.temperature`)
- Wildcard `*` : remplace **exactement un mot** (`maison.*.temperature` matche `maison.salon.temperature`)
- Wildcard `#` : remplace **zero ou plusieurs mots** (`maison.#` matche `maison.salon.temperature` et `maison.garage`)

## Commandes rabbitmqctl utiles

```bash
# Lister les queues avec le nombre de messages
rabbitmqctl list_queues

# Lister les exchanges
rabbitmqctl list_exchanges

# Lister les bindings (liaisons exchange -> queue)
rabbitmqctl list_bindings

# Lister les utilisateurs
rabbitmqctl list_users

# Ajouter un utilisateur
rabbitmqctl add_user <username> <password>

# Definir les permissions d'un utilisateur
rabbitmqctl set_permissions -p / <username> ".*" ".*" ".*"
```

> **Astuce :** pour executer ces commandes dans le conteneur Docker, prefixez avec `docker exec rabbitmq`.

## Ports par defaut

| Port | Protocole |
|------|-----------|
| 5672 | AMQP |
| 15672 | Management UI |
| 1883 | MQTT |

## Commandes Docker utiles

```bash
# Demarrer les services en arriere-plan
docker compose up -d

# Arreter et supprimer les conteneurs
docker compose down

# Voir les logs de RabbitMQ
docker compose logs rabbitmq
```
