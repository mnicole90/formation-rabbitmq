# Coup de pouce #2 — Routing par sévérité

## Convention de nommage des routing keys

Pour l'exchange `alerts`, utilisez cette structure :

```
alert.{severity}.{type_capteur}
```

Les trois parties :

- `alert` : préfixe fixe (permet de filtrer facilement)
- `{severity}` : `info`, `warning` ou `critical`
- `{type_capteur}` : `fumee`, `mouvement`, `porte`, `temperature`

## Exemples concrets

| Situation | Routing key |
|-----------|------------|
| Fumée > 70 | `alert.critical.fumee` |
| Température > 50°C | `alert.critical.temperature` |
| Température > 35°C (mais < 50°C) | `alert.warning.temperature` |
| Porte ouverte la nuit | `alert.warning.porte` |
| Mouvement détecté | `alert.info.mouvement` |
| Porte ouverte en journée | `alert.info.porte` |
| Porte ouverte la nuit + mouvement | `alert.critical.porte` |

## Bindings par consumer

Grâce au Topic Exchange, chaque consumer peut s'abonner uniquement aux messages qui l'intéressent :

| Consumer | Binding | Reçoit |
|----------|---------|--------|
| Service Alertes urgentes | `alert.critical.*` | Uniquement les alertes critiques |
| Service Alertes | `alert.critical.*` + `alert.warning.*` | Les critiques et les warnings |
| Service Logging | `alert.#` | Tous les messages (info, warning, critical) |
| Consumer fumée (bonus) | `alert.*.fumee` | Toutes les alertes fumée, quel que soit le niveau |

## Pseudo-code de la logique de classification

Voici la logique a implémenter dans votre service de classification. Ce n'est pas du code complet, c'est un guide pour structurer vos conditions :

```
FONCTION classifier(message):

    type = message.sensor
    valeur = message.value
    heure = extraire_heure(message.timestamp)

    // --- Vérifier CRITICAL en premier (priorité haute) ---

    SI type == "fumee" ET valeur > 70:
        severity = "critical"

    SINON SI type == "temperature" ET valeur > 50:
        severity = "critical"

    // --- Puis WARNING ---

    SINON SI type == "temperature" ET valeur > 35:
        severity = "warning"

    SINON SI type == "porte" ET valeur == "open" ET heure >= 22:
        severity = "warning"

    // --- Par défaut : INFO ---

    SINON SI type == "mouvement" ET valeur == true:
        severity = "info"

    SINON SI type == "porte" ET valeur == "open" ET heure < 22:
        severity = "info"

    SINON:
        // Pas d'alerte nécessaire (valeurs normales)
        RETOURNER null

    // --- Publier sur l'exchange "alerts" ---

    routing_key = "alert." + severity + "." + type
    publier(exchange="alerts", routing_key, message_avec_severity)
```

### Cas spécial : porte ouverte la nuit + mouvement

Pour détecter la combinaison **porte ouverte la nuit + mouvement détecté simultanément** (qui est CRITICAL), il vous faudra garder en mémoire l'état des capteurs. Par exemple :

```
// Stocker l'état courant de chaque pièce
etat_pieces = {}

SI type == "porte" ET valeur == "open" ET heure >= 22:
    etat_pieces[piece].porte_ouverte_nuit = true

SI type == "mouvement" ET valeur == true:
    SI etat_pieces[piece].porte_ouverte_nuit == true:
        severity = "critical"  // Combinaison détectée !
```

C'est la partie la plus complexe du projet. Si vous manquez de temps, traitez d'abord les cas simples et ajoutez cette logique ensuite.
