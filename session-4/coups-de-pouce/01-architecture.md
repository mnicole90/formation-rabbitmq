# Coup de pouce #1 — Architecture suggérée

## Vue d'ensemble

Voici une architecture possible pour votre système. Ce n'est pas la seule solution valide, mais elle couvre toutes les exigences du cahier des charges.

## Schéma

```
                          MQTT                          AMQP
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                 │
 │  CAPTEURS (MQTT)                    RABBITMQ                    SERVICES (AMQP) │
 │                                                                                 │
 │  ┌──────────┐                                                                   │
 │  │  Fumée   │──┐                                                                │
 │  └──────────┘  │                                                                │
 │  ┌──────────┐  │  MQTT publish     ┌───────────┐                                │
 │  │Mouvement │──┼─────────────────► │ amq.topic │ (exchange par défaut MQTT)     │
 │  └──────────┘  │                   └─────┬─────┘                                │
 │  ┌──────────┐  │  Topics MQTT :          │                                      │
 │  │  Porte   │──┤  maison/{piece}/        │  binding : maison.#                  │
 │  └──────────┘  │    {type_capteur}       │                                      │
 │  ┌──────────┐  │                         ▼                                      │
 │  │  Temp.   │──┘                   ┌───────────┐     ┌────────────────┐         │
 │  └──────────┘                      │  queue     │────►│  Service       │         │
 │                                    │  capteurs  │     │  Validation    │         │
 │                                    └───────────┘     └───────┬────────┘         │
 │                                                              │                  │
 │                                                    publish   │                  │
 │                                                              ▼                  │
 │                                                      ┌──────────────┐           │
 │                                                      │  "validated" │           │
 │                                                      │ (topic exch) │           │
 │                                                      └──────┬───────┘           │
 │                                                             │                   │
 │                                                   binding : │ validated.#       │
 │                                                             ▼                   │
 │                                                      ┌────────────┐             │
 │                                                      │   queue    │             │
 │                                                      │  validated │             │
 │                                                      └─────┬──────┘             │
 │                                                            │                    │
 │                                                            ▼                    │
 │                                                    ┌────────────────┐           │
 │                                                    │    Service     │           │
 │                                                    │ Classification │           │
 │                                                    └───────┬────────┘           │
 │                                                            │                    │
 │                                                  publish   │ routing key :      │
 │                                                            │ alert.{severity}.  │
 │                                                            │   {type_capteur}   │
 │                                                            ▼                    │
 │                                                     ┌─────────────┐             │
 │                                                     │  "alerts"   │             │
 │                                                     │(topic exch) │             │
 │                                                     └──────┬──────┘             │
 │                                                            │                    │
 │                              ┌─────────────────────────────┼──────────┐         │
 │                              │                             │          │         │
 │                    alert.critical.*              alert.warning.*  alert.#       │
 │                    alert.warning.*                          │          │         │
 │                              │                             │          │         │
 │                              ▼                             ▼          ▼         │
 │                       ┌─────────────┐            ┌──────────┐ ┌──────────┐     │
 │                       │   queue     │            │  queue   │ │  queue   │     │
 │                       │   alertes   │            │ dashboard│ │  logs    │     │
 │                       └──────┬──────┘            └────┬─────┘ └────┬─────┘     │
 │                              │                        │            │            │
 │                              ▼                        ▼            ▼            │
 │                       ┌─────────────┐         ┌──────────┐ ┌───────────┐       │
 │                       │  Service    │         │ Dashboard│ │  Service  │       │
 │                       │  Alertes    │         │  (bonus) │ │  Logging  │       │
 │                       └─────────────┘         └──────────┘ └───────────┘       │
 │                                                                                 │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

## Topics MQTT des capteurs

Les capteurs publient en MQTT avec la convention suivante :

```
maison/{piece}/{type_capteur}
```

Exemples :

| Capteur | Topic MQTT | Converti en routing key AMQP |
|---------|-----------|------------------------------|
| Fumée cuisine | `maison/cuisine/fumee` | `maison.cuisine.fumee` |
| Mouvement salon | `maison/salon/mouvement` | `maison.salon.mouvement` |
| Porte entrée | `maison/entree/porte` | `maison.entree.porte` |
| Température chambre | `maison/chambre/temperature` | `maison.chambre.temperature` |

> Rappel : RabbitMQ convertit automatiquement les `/` MQTT en `.` pour les routing keys AMQP.

## Exchanges et routing keys

| Exchange | Type | Rôle |
|----------|------|------|
| `amq.topic` | Topic | Reçoit les messages MQTT des capteurs |
| `validated` | Topic | Messages validés, prêts à être classifiés |
| `alerts` | Topic | Alertes classifiées par sévérité |

### Routing keys sur l'exchange `alerts`

```
alert.{severity}.{type_capteur}
```

Exemples : `alert.critical.fumee`, `alert.warning.temperature`, `alert.info.mouvement`

## Services

| Service | Consomme depuis | Publie sur | Rôle |
|---------|----------------|-----------|------|
| Validation | `amq.topic` (binding `maison.#`) | `validated` | Vérifie le format des messages, rejette les invalides |
| Classification | `validated` (binding `validated.#`) | `alerts` | Détermine la sévérité selon les règles du cahier des charges |
| Alertes | `alerts` (binding `alert.critical.*` et `alert.warning.*`) | — | Affiche / traite les alertes urgentes |
| Logging | `alerts` (binding `alert.#`) | — | Enregistre tous les événements |

## Ce qu'il vous reste a faire

1. Choisir votre langage (Python, Node.js, Node-RED)
2. Coder les producers (capteurs MQTT)
3. Coder les consumers (services AMQP)
4. Configurer les permissions RabbitMQ
5. Tester le pipeline bout en bout
