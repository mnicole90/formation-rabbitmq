# Evaluation Session 2 — Conception d'une architecture RabbitMQ

**Durée estimée : 15 minutes**
**Barème : 20 points**

---

## Énoncé

Vous devez concevoir l'architecture RabbitMQ d'un système domotique pour un immeuble de 3 étages. Chaque étage dispose de capteurs de **température**, de **mouvement** et de **fumée**.

Les contraintes sont les suivantes :

- Un **gardien** doit recevoir **toutes les alertes fumée** de l'immeuble.
- Un **résident** ne doit recevoir que les **alertes de son étage**.
- Un **système de logging** doit **tout enregistrer**.

---

## Questions

### Question 1 — Type d'exchange (5 points)

Quel type d'exchange choisissez-vous pour cette architecture ? Justifiez votre choix.

### Question 2 — Schéma d'architecture (8 points)

Dessinez le schéma d'architecture complet : exchanges, queues, bindings avec routing keys.

Vous pouvez utiliser un schéma sur papier, draw.io, ou en ASCII.

### Question 3 — Permissions (4 points)

Quelles permissions donneriez-vous :

- À un **capteur du 2ème étage** ?
- Au **dashboard du gardien** ?

### Question 4 — Fiabilité des alertes fumée (3 points)

Comment garantir qu'aucun message d'alerte fumée ne soit perdu, même si le système d'alerte du gardien est temporairement en panne ?

---

## Corrigé indicatif

<details>
<summary>Cliquez pour afficher le corrigé</summary>

### Q1 — Type d'exchange (5 points)

**Topic Exchange**, car il permet un routing flexible basé sur des patterns de routing keys hiérarchiques.

On peut structurer les routing keys sous la forme : `etage.piece.type_capteur` (ex : `etage1.salon.temperature`, `etage2.chambre.fumee`).

Cela permet de :

- Filtrer par étage (`etage1.#` → toutes les alertes de l'étage 1)
- Filtrer par type de capteur (`*.*.fumee` → toutes les alertes fumée)
- Capturer tout (`#` → pour le logging)

Un **direct exchange** serait trop rigide (pas de pattern matching). Un **fanout exchange** enverrait tout à tout le monde sans possibilité de filtrage.

### Q2 — Schéma d'architecture (8 points)

```
                         Topic Exchange
                        [domotique_exchange]
                              |
       Routing keys:          |
       etage1.salon.temperature
       etage1.hall.mouvement
       etage1.cuisine.fumee
       etage2.salon.temperature
       etage2.chambre.fumee
       etage3.hall.mouvement
       ...                    |
                              |
      ┌───────────────────────┼───────────────────────┐
      │                       │                       │
      │                       │                       │
  Binding: etage1.#     Binding: *.*.fumee      Binding: #
      │                       │                       │
      ▼                       ▼                       ▼
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│ queue_etage1 │     │ queue_gardien    │     │ queue_logging │
│ (résident 1) │     │ (alertes fumée)  │     │ (tout)        │
└─────────────┘     └──────────────────┘     └──────────────┘
      │                       │                       │
      ▼                       ▼                       ▼
  Résident                 Gardien               Système de
  étage 1                                        logging
```

De la même manière, on crée `queue_etage2` (binding `etage2.#`) et `queue_etage3` (binding `etage3.#`) pour les résidents des étages 2 et 3.

**Routing keys possibles :**

| Routing key | Description |
|---|---|
| `etage1.salon.temperature` | Capteur température, salon, étage 1 |
| `etage2.chambre.fumee` | Capteur fumée, chambre, étage 2 |
| `etage3.hall.mouvement` | Capteur mouvement, hall, étage 3 |

**Bindings :**

| Queue | Binding key | Reçoit |
|---|---|---|
| `queue_etage1` | `etage1.#` | Tout l'étage 1 |
| `queue_etage2` | `etage2.#` | Tout l'étage 2 |
| `queue_etage3` | `etage3.#` | Tout l'étage 3 |
| `queue_gardien` | `*.*.fumee` | Toutes les alertes fumée |
| `queue_logging` | `#` | Tous les messages |

### Q3 — Permissions (4 points)

**Capteur du 2ème étage :**

- **Write** (publish) uniquement sur l'exchange `domotique_exchange`
- **Pas de read** (il n'a pas besoin de consommer de messages)
- **Pas d'accès** aux queues

**Dashboard du gardien :**

- **Read** (consume) uniquement sur la queue `queue_gardien`
- **Pas de write** (il ne publie pas de messages)
- **Pas d'accès** à l'exchange en écriture

Cela respecte le **principe du moindre privilège** : chaque composant n'a accès qu'à ce dont il a strictement besoin.

### Q4 — Fiabilité des alertes fumée (3 points)

Pour garantir qu'aucun message d'alerte fumée ne soit perdu :

1. **Queue durable** : la queue `queue_gardien` doit être déclarée comme `durable: true` pour survivre à un redémarrage du broker.
2. **Messages persistants** : les messages doivent être publiés avec `deliveryMode: 2` (persistent) pour être écrits sur disque.
3. **Acquittement manuel** (manual acknowledgment) : le consumer du gardien doit envoyer un `ack` explicite après traitement du message (pas de `autoAck`).

Si le consumer du gardien est temporairement en panne, les messages s'accumulent dans la queue durable. Lorsqu'il revient en ligne, tous les messages en attente lui sont livrés dans l'ordre.

</details>
