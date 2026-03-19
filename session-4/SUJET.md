# Projet Final — Système de Sécurité Domotique

## Mise en contexte

Vous êtes l'équipe technique de **IoT-Home**, une startup qui développe des systèmes de sécurité pour maisons connectées. Votre client, M. Dupont, vient d'emménager dans une maison neuve et souhaite un système de surveillance complet. Il veut être alerté en temps réel en cas de danger, tout en ayant un suivi de la température et de l'humidité de chaque pièce.

Votre mission : concevoir et implémenter un système complet qui collecte les données de capteurs, les analyse, et déclenche les alertes appropriées via RabbitMQ.

---

## Cahier des charges

### 1. Les capteurs (minimum 4 types)

Votre système doit simuler au moins **4 types de capteurs** :

| Capteur | Valeur | Format |
|---------|--------|--------|
| **Fumée** | Niveau de 0 à 100 | Nombre entier |
| **Mouvement** | Détecté ou non | Booléen (`true` / `false`) |
| **Porte / Fenêtre** | Ouverte ou fermée | `"open"` / `"closed"` |
| **Température** | En degrés Celsius | Nombre décimal |

Chaque message envoyé par un capteur doit contenir au minimum :

```json
{
  "sensor": "fumee",
  "value": 42,
  "room": "cuisine",
  "timestamp": "2026-03-19T14:30:00Z",
  "severity": "info"
}
```

### 2. Niveaux de sévérité

Votre système doit classifier chaque événement selon trois niveaux de sévérité :

#### INFO

- Mouvement détecté
- Porte ou fenêtre ouverte **en journée** (avant 22h)

#### WARNING

- Température supérieure à **35°C**
- Porte ou fenêtre ouverte **la nuit** (après 22h)

#### CRITICAL

- Fumée supérieure à **70**
- Température supérieure à **50°C**
- Porte ou fenêtre ouverte la nuit **ET** mouvement détecté simultanément

### 3. Routing intelligent

Les alertes doivent être distribuées intelligemment :

- **CRITICAL** : déclenche **tous** les consumers (service d'alertes, logging, dashboard...)
- **WARNING** : déclenche le service d'alertes et le logging
- **INFO** : déclenche **uniquement** le service de logging

Utilisez un **Topic Exchange** avec des routing keys bien structurées pour gérer cette distribution.

### 4. Flux MQTT obligatoire

Les capteurs doivent publier leurs données en **MQTT** (via le plugin RabbitMQ MQTT). Les services en aval (validation, classification, alertes, logging) consomment en **AMQP**.

Rappel : le `docker-compose.mqtt.yml` de la session 3 active le plugin MQTT.

### 5. Permissions RabbitMQ

Vous devez configurer des **utilisateurs RabbitMQ avec des permissions restreintes** :

- **Capteurs** : droits en **écriture uniquement** (pas de lecture)
- **Dashboard / Alertes** : droits en **lecture uniquement** (pas d'écriture)

Vous devez **démontrer** que les permissions fonctionnent : par exemple, montrer qu'un capteur ne peut pas lire une queue.

---

## Livrables attendus

### 1. Schéma d'architecture

Un schéma montrant clairement :

- Les capteurs (producers)
- Les exchanges utilisés et leur type
- Les queues
- Les bindings avec les routing keys
- Les services (consumers)

Format libre : papier, draw.io, Mermaid, ASCII art... L'important est que ce soit **clair et complet**.

### 2. Code fonctionnel

- Un ou plusieurs **producer(s)** qui simulent les capteurs
- Un ou plusieurs **consumer(s)** qui traitent les messages
- Le tout doit **tourner** et être démontrable

### 3. Démo live (5 minutes)

Devant la classe, vous devez :

1. **Lancer** votre système (docker-compose + scripts)
2. **Montrer** les messages qui circulent dans RabbitMQ
3. **Déclencher** une alerte CRITICAL et montrer qu'elle arrive aux bons consumers
4. **Démontrer** les permissions (tentative de lecture avec un user write-only)

---

## Modalités

| | |
|---|---|
| **Travail** | En binôme ou trinôme |
| **Durée** | 1h30 de développement |
| **Langage** | Au choix : Python, Node.js, Node-RED, ou mix |
| **Base de code** | Vous pouvez réutiliser le code des sessions précédentes |
| **Coups de pouce** | 3 disponibles si vous êtes bloqués (indice, pas de pénalité) |

---

## Conseil

Commencez par le **schéma d'architecture** AVANT de coder. Un bon schéma = un développement plus rapide.

Prenez 15-20 minutes pour dessiner votre architecture, vous mettre d'accord sur les routing keys, et répartir le travail dans le groupe. Ce temps n'est jamais perdu.
