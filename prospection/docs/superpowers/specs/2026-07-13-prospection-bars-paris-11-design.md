# Automatisation de prospection « Bars Paris 11e » — Design

**Date :** 2026-07-13
**Statut :** Validé (brainstorming)

## Objectif

Automatiser la prospection de bars du 11e arrondissement de Paris avec Trigger.dev :
rechercher les bars et leurs dirigeants via Pappers, enrichir les coordonnées
(email via Firecrawl si absent, profil LinkedIn via Apify), générer des messages
personnalisés par LLM, notifier sur Telegram (message LinkedIn à copier-coller
manuellement + brouillon email), et envoyer l'email via Resend uniquement après
approbation manuelle depuis Telegram.

## Décisions cadrées

- **Projet neuf** Node/TypeScript avec **Trigger.dev v4**, dans `/prospection`.
- **Cron planifié** ; traitement **unitaire** des bars (un à la fois).
- **Neon Postgres** + **Drizzle ORM** pour le suivi (dédup par SIREN, statuts, migrations).
- Pipeline : Pappers → (Firecrawl si pas d'email) → Apify LinkedIn → génération messages LLM.
- **LLM via OpenRouter**, modèle `claude-sonnet-5`.
- **Telegram** : message LinkedIn en notification (copier-coller manuel) + brouillon email
  avec bouton d'approbation inline.
- **Resend** : envoi réel de l'email uniquement après clic sur le bouton d'approbation.
- **Pas de serveur HTTP, pas de webhook** : la task se suspend et interroge `getUpdates`
  elle-même toutes les minutes.
- **Timeout d'approbation : 24 h.**

## Architecture

### Composants

- **Trigger.dev v4** — orchestration des tasks (cron + enrichissement unitaire).
- **Neon Postgres + Drizzle ORM** — persistance et suivi des prospects.
- **APIs externes** :
  - **Pappers** — recherche d'entreprises (bars 75011, NAF 56.30Z) et dirigeants.
  - **Firecrawl** — scraping du site web du bar pour extraire un email si Pappers n'en fournit pas.
  - **Apify** (`harvestapi/linkedin-profile-search`) — recherche du profil LinkedIn du dirigeant.
  - **OpenRouter** (`claude-sonnet-5`) — rédaction des messages personnalisés.
  - **Telegram Bot API** — notifications + bouton d'approbation + polling `getUpdates`.
  - **Resend** — envoi de l'email de prospection après approbation.

### Pas de serveur / pas de webhook

Contrainte forte : aucune exposition réseau. La boucle d'approbation repose entièrement
sur le polling `getUpdates` **depuis l'intérieur du run Trigger.dev**.

`getUpdates` est une file unique par bot : un update confirmé (via l'offset) disparaît
pour tous les consommateurs. Pour éviter que plusieurs runs se volent les clics, on impose
un **unique consommateur à la fois** grâce à une **file `enrich-prospect` avec
`concurrencyLimit: 1`**. Un seul run attend une approbation à un instant donné ; il peut
donc appeler `getUpdates` directement sans contention, ni poller dédié, ni table d'état.

L'offset `getUpdates` est conservé dans une **variable locale du run**, préservée entre les
suspensions par le checkpointing de Trigger.dev.

## Tasks Trigger.dev

### `prospection-cron` (`schedules.task`)

Fréquence : planifiée (par défaut quotidienne, ex. 9h — configurable).

1. Appelle Pappers `/recherche` : bars du **75011**, NAF **56.30Z** (débits de boissons).
2. Récupère les SIREN déjà présents en base et les exclut.
3. Déclenche `enrich-prospect` pour chaque nouveau bar (les runs se sérialisent via la
   file à concurrence 1). Aucune limite de lot stricte n'est nécessaire côté cron : la
   file régule le débit ; on peut néanmoins plafonner à ~10 déclenchements par tick pour
   éviter une file trop longue.

### `enrich-prospect` (task, un bar)

`queue: { concurrencyLimit: 1 }`.

1. **Pappers** — fiche entreprise détaillée : dénomination, adresse, activité, site web,
   dirigeants (nom, prénom, fonction), email éventuel.
2. **Firecrawl (conditionnel)** — si aucun email : scrape le site web du bar et extrait
   un email (regex + validation basique). `email_source = 'firecrawl'`.
3. **Apify** — `harvestapi/linkedin-profile-search` sur le dirigeant principal → URL de
   profil LinkedIn + headline. Si aucun profil : on continue avec un message LinkedIn
   plus générique et une note.
4. **OpenRouter (`claude-sonnet-5`)** — génère :
   - un ice-breaker LinkedIn (connexion) ;
   - un email de prospection (objet + corps).
   Le prompt s'appuie sur les données collectées (bar, dirigeant, activité, quartier,
   headline LinkedIn).
5. **Persistance Neon** — insert `prospects` + `dirigeants` + `messages`, `status = 'enriched'`.
6. **Telegram** :
   - message 1 : brouillon LinkedIn + URL du profil (copier-coller manuel) ;
   - message 2 (si email) : brouillon email + bouton inline **« ✅ Envoyer »**
     (`callback_data = approve:<prospectId>`).
7. **Boucle d'approbation (si email présent)** :
   - `wait.for({ minutes: 1 })` puis appel `getUpdates` (offset local) ;
   - clic détecté sur le bon `callback_data` → `answerCallbackQuery` (« Email en cours
     d'envoi ✅ ») → **Resend** envoie → `status = 'email_sent'`, `messages.sent_at` renseigné ;
   - **timeout 24 h** sans réponse → `status = 'email_expired'` ;
   - **pas d'email** → `status = 'linkedin_only'`, run terminé immédiatement (ne bloque pas
     la file).

## Schéma de données (Neon / Drizzle)

### `prospects`
| colonne | type | notes |
|---|---|---|
| id | serial PK | |
| siren | text unique | dédup |
| denomination | text | |
| adresse | text | |
| code_postal | text | |
| activite | text | |
| website | text nullable | |
| email | text nullable | |
| email_source | text nullable | `'pappers' \| 'firecrawl'` |
| status | text | `enriched \| linkedin_only \| email_sent \| email_expired` |
| created_at | timestamptz | défaut now() |
| updated_at | timestamptz | |

### `dirigeants`
| colonne | type | notes |
|---|---|---|
| id | serial PK | |
| prospect_id | int FK → prospects.id | |
| nom | text | |
| prenom | text | |
| fonction | text nullable | |
| linkedin_url | text nullable | |
| linkedin_headline | text nullable | |

### `messages`
| colonne | type | notes |
|---|---|---|
| id | serial PK | |
| prospect_id | int FK → prospects.id | |
| channel | text | `'linkedin' \| 'email'` |
| subject | text nullable | email uniquement |
| body | text | |
| status | text | `draft \| sent` |
| sent_at | timestamptz nullable | |

### Cycle de vie du statut prospect

```
enriched ─┬─► linkedin_only        (pas d'email)
          └─► [attente approbation]
                 ├─► email_sent      (clic « Envoyer »)
                 └─► email_expired   (timeout 24 h)
```

## Gestion d'erreurs & robustesse

- **Retries natifs** Trigger.dev configurés par task.
- Chaque appel externe isolé : l'échec d'une API (ex. Apify) ne fait pas échouer tout le
  run — on dégrade (message générique) et on poursuit.
- **Idempotence** : contrainte unique sur `siren`. Un bar déjà traité est ignoré par le cron.
- **Rate-limits** : la file à concurrence 1 et le plafond de déclenchements par tick
  limitent la pression sur les APIs.
- **Firecrawl sans email** → chemin `linkedin_only`.
- **Apify sans profil** → message LinkedIn générique + note dans le message.
- **Offset `getUpdates`** géré localement dans le run ; on ignore les updates antérieurs au
  message d'approbation courant pour ne pas confondre les clics.

## Variables d'environnement

| variable | usage |
|---|---|
| `DATABASE_URL` | connexion Neon Postgres |
| `TRIGGER_SECRET_KEY` | Trigger.dev |
| `PAPPERS_API_KEY` | Pappers |
| `FIRECRAWL_API_KEY` | Firecrawl |
| `APIFY_TOKEN` | Apify |
| `OPENROUTER_API_KEY` | OpenRouter (LLM) |
| `OPENROUTER_MODEL` | défaut `claude-sonnet-5` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API |
| `TELEGRAM_CHAT_ID` | destinataire des notifications |
| `RESEND_API_KEY` | Resend |
| `RESEND_FROM` | expéditeur des emails |
| `APPROVAL_TIMEOUT_HOURS` | défaut `24` |

## Tests

- **Vitest** avec mocks des APIs externes :
  - extraction d'email à partir du contenu Firecrawl ;
  - mapping réponse Pappers → `prospects` / `dirigeants` ;
  - construction des prompts et parsing de la sortie LLM (LinkedIn + email) ;
  - logique de détection du bon `callback_data` dans `getUpdates`.
- **Run manuel** via `npx trigger.dev dev` + déclenchement de `enrich-prospect` sur un SIREN
  connu pour valider le pipeline de bout en bout.

## Hors périmètre (YAGNI)

- Envoi automatique de connexions LinkedIn (reste manuel via copier-coller).
- Interface d'administration / dashboard custom (le dashboard Trigger.dev + la base Neon
  suffisent).
- Séquences de relance multi-touch (un seul contact par prospect pour cette itération).
- Gestion multi-arrondissements / multi-secteurs (focalisé sur bars 75011).
