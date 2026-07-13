# Prospection — Bars Paris 11e

Automatisation Trigger.dev qui recherche les bars du 11e arrondissement de Paris
(API Pappers, NAF `56.30Z`), récupère un email (Pappers, puis Firecrawl en repli),
trouve le profil LinkedIn du dirigeant (Apify), rédige un message LinkedIn et un
email personnalisés (OpenRouter / `claude-sonnet-5`), notifie sur Telegram, et
n'envoie l'email via Resend qu'après un clic d'approbation manuel dans Telegram.

Design complet : [`docs/superpowers/specs/2026-07-13-prospection-bars-paris-11-design.md`](docs/superpowers/specs/2026-07-13-prospection-bars-paris-11-design.md)
Plan d'implémentation : [`docs/superpowers/plans/2026-07-13-prospection-bars-paris-11.md`](docs/superpowers/plans/2026-07-13-prospection-bars-paris-11.md)

---

## 1. Vue d'ensemble du pipeline

```
prospection-cron (tous les jours 9h)
  └─ cherche les bars 75011 / NAF 56.30Z via Pappers
  └─ exclut les SIREN déjà en base (dédup)
  └─ déclenche enrich-prospect pour chaque nouveau bar (max 10/run)

enrich-prospect (1 bar à la fois, queue concurrencyLimit: 1)
  1. Pappers        → fiche entreprise + dirigeants (+ email éventuel)
  2. Firecrawl       → email via le site web, si Pappers n'en a pas fourni
  3. Apify           → profil LinkedIn du dirigeant
  4. OpenRouter      → rédige le message LinkedIn + l'email (JSON structuré)
  5. Neon (Drizzle)  → enregistre prospect / dirigeant / messages
  6. Telegram        → envoie le brouillon LinkedIn (à copier-coller)
                       + le brouillon email avec un bouton "✅ Envoyer"
  7. Boucle d'attente → réveil toutes les minutes, lit les clics Telegram
                       (getUpdates) pendant 24h max
       - clic reçu     → Resend envoie l'email, statut "email_sent"
       - 24h écoulées  → statut "email_expired"
       - pas d'email   → statut "linkedin_only" (aucune attente)
```

Aucun serveur HTTP, aucun webhook : l'approbation Telegram est lue par polling
interne au run (`wait.for` + `getUpdates`), rendue possible par la queue à
concurrence 1 (un seul run attend un clic à la fois).

---

## 2. Comptes et clés à récupérer AVANT de commencer

Chaque ligne = un compte à créer + une clé à copier dans `.env`. Comptez environ
20-30 minutes pour tout réunir.

| # | Service | Ce qu'il faut | Où le récupérer | Variable(s) |
|---|---|---|---|---|
| 1 | **Trigger.dev** | Un compte + un projet | [cloud.trigger.dev](https://cloud.trigger.dev) → Project settings → API keys → clé **dev** (puis **prod** plus tard) | `TRIGGER_SECRET_KEY` |
| 2 | **Neon** | Un projet Postgres serverless | [console.neon.tech](https://console.neon.tech) → Connection Details → copier l'URI (pooled) | `DATABASE_URL` |
| 3 | **Pappers** | Un compte API (offre payante au-delà du quota gratuit) | [pappers.fr/api](https://www.pappers.fr/api) → Dashboard → clé API | `PAPPERS_API_KEY` |
| 4 | **Firecrawl** | Un compte | [firecrawl.dev](https://www.firecrawl.dev) → Dashboard → API Keys | `FIRECRAWL_API_KEY` |
| 5 | **Apify** | Un compte + accès à l'actor `harvestapi/linkedin-profile-search` | [console.apify.com](https://console.apify.com) → Settings → Integrations → Personal API token | `APIFY_TOKEN` |
| 6 | **OpenRouter** | Un compte + crédit | [openrouter.ai](https://openrouter.ai) → Keys | `OPENROUTER_API_KEY` |
| 7 | **Telegram** | Un bot créé via [@BotFather](https://t.me/BotFather) (`/newbot`) | BotFather te donne le token directement après création | `TELEGRAM_BOT_TOKEN` |
| 8 | **Telegram** | L'ID du chat où recevoir les notifs | Envoie un message à ton bot, puis ouvre `https://api.telegram.org/bot<TOKEN>/getUpdates` et lis `message.chat.id` | `TELEGRAM_CHAT_ID` |
| 9 | **Resend** | Un compte + un domaine d'envoi vérifié | [resend.com](https://resend.com) → API Keys, et Domains pour vérifier ton domaine d'expédition | `RESEND_API_KEY`, `RESEND_FROM` (ex: `prospection@tondomaine.fr`) |

Le fichier [`.env.example`](.env.example) liste exactement ces variables (plus
`OPENROUTER_MODEL`, déjà défaulté à `anthropic/claude-sonnet-5`, et
`APPROVAL_TIMEOUT_HOURS`, déjà défaulté à `24`).

**Point d'attention Apify** : l'actor `harvestapi/linkedin-profile-search` est
un actor tiers du Store Apify — assure-toi de l'avoir "essayé" une fois dans la
console Apify (bouton *Try for free*) pour qu'il soit accessible à ton compte
avant le premier run réel.

---

## 3. Mise en place locale

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env
# → remplir toutes les valeurs du tableau ci-dessus dans .env

# 3. Appliquer le schéma Drizzle sur Neon
npm run db:generate   # génère la migration SQL dans drizzle/
npm run db:push        # l'applique sur la base Neon (DATABASE_URL)

# 4. Vérifier que tout compile et que les tests passent
npx tsc --noEmit
npm test
```

`npm test` fait tourner 33 tests. Les tests de `src/db/queries.test.ts` tapent
la vraie base Neon (ils sont automatiquement ignorés si `DATABASE_URL` est
absent de l'environnement) — les autres mockent tous les appels réseau.

---

## 4. Lancer en local (`trigger dev`)

```bash
npx trigger.dev@latest dev
```

Ceci connecte ton code à l'environnement **dev** du projet Trigger.dev (clé
`TRIGGER_SECRET_KEY` commençant par `tr_dev_...`) et enregistre les deux tasks :

- `prospection-cron` — planifiée `0 9 * * *` (tous les jours à 9h, en UTC par
  défaut — ajoute une `timezone` sur la task si tu veux un fuseau français).
- `enrich-prospect` — déclenchée par `prospection-cron`, ou manuellement pour
  tester.

### Tester manuellement sur un seul bar

Dans le dashboard Trigger.dev ([cloud.trigger.dev](https://cloud.trigger.dev),
onglet *Test* de la task `enrich-prospect`), envoie un payload :

```json
{ "siren": "<un SIREN réel d'un bar du 75011, trouvable via l'app Pappers>" }
```

Vérifie ensuite :
1. Un message Telegram avec le brouillon LinkedIn arrive.
2. Si un email a été trouvé, un second message Telegram arrive avec un bouton
   **"✅ Envoyer"**.
3. En cliquant sur ce bouton, l'email part réellement via Resend dans la
   minute qui suit (le run se réveille chaque minute pour vérifier).
4. En base Neon, la ligne `prospects` correspondante passe de `enriched` à
   `email_sent` (ou `email_expired` si tu ne cliques pas dans les 24h, ou
   `linkedin_only` si aucun email n'a été trouvé).

Pour interroger Neon directement :

```sql
select siren, denomination, status, email, email_source
from prospects
order by created_at desc
limit 5;
```

---

## 5. Passer en production

### 5.1 Déployer le worker

```bash
npx trigger.dev@latest deploy
```

Ceci build et déploie le code sur l'environnement **prod** du projet
Trigger.dev. La task `prospection-cron` planifiée commencera à s'exécuter
automatiquement selon son cron dès que le déploiement est actif.

### 5.2 Configurer les variables d'environnement de prod

Les variables de `.env` ne sont utilisées qu'en **local** (`trigger dev`). Pour
la prod, chaque variable doit être ajoutée séparément dans le dashboard
Trigger.dev :

**Project → Environment Variables → Production**, et y renseigner exactement
les mêmes clés que dans `.env.example` (avec, si tu utilises des comptes ou
quotas différents en prod, des valeurs distinctes — par exemple une clé
Resend de prod avec le domaine réellement vérifié).

`TRIGGER_SECRET_KEY` n'est pas à renseigner ici : c'est la clé **prod** que tu
utilises côté CI/déploiement (`npx trigger.dev@latest deploy` la demande ou la
lit depuis l'auth CLI), pas une variable de la task elle-même.

### 5.3 Checklist avant le premier run de prod

- [ ] `DATABASE_URL` de prod pointe vers la bonne base Neon (une branche Neon
      dédiée à la prod est recommandée plutôt que de réutiliser la branche de
      dev).
- [ ] Les clés Pappers / Firecrawl / Apify / OpenRouter / Resend sont des clés
      qui ont un quota suffisant pour un usage récurrent quotidien (pas des
      clés d'essai gratuites limitées).
- [ ] `TELEGRAM_CHAT_ID` de prod pointe vers le bon chat (attention à ne pas
      envoyer les tests de dev et les vrais messages de prod au même endroit
      si tu veux les distinguer).
- [ ] `RESEND_FROM` utilise un domaine vérifié dans Resend (sinon les emails
      partiront en erreur ou en spam).
- [ ] Le cron de `prospection-cron` (`0 9 * * *`, UTC) correspond bien à
      l'heure voulue — ajuste `cron` et ajoute `timezone: "Europe/Paris"` dans
      `src/trigger/prospection-cron.ts` si besoin.
- [ ] Premier run surveillé manuellement depuis le dashboard Trigger.dev (onglet
      *Runs*) pour confirmer que le pipeline se déroule sans erreur sur des
      données réelles.

### 5.4 Surveillance continue

- Dashboard Trigger.dev → onglet **Runs** : statut de chaque `enrich-prospect`
  (un par bar), logs détaillés de chaque étape (Pappers, Firecrawl, Apify,
  OpenRouter, Telegram, Resend).
- Table Neon `prospects.status` : vue d'ensemble de l'avancement (`enriched`,
  `linkedin_only`, `email_sent`, `email_expired`).
- Si un run reste bloqué en attente d'approbation plus de 24h, il expirera
  automatiquement (`email_expired`) — aucune intervention nécessaire, mais le
  prospect ne recevra pas d'email tant qu'il n'est pas re-traité manuellement.

---

## 6. Structure du code

```
src/
  db/
    schema.ts       — tables Drizzle (prospects, dirigeants, messages)
    client.ts        — client Neon/Drizzle
    queries.ts       — fonctions CRUD (dédup SIREN, insert, update de statut)
  lib/
    pappers.ts        — recherche + fiche entreprise
    firecrawl.ts      — extraction d'email depuis un site web
    apify.ts          — recherche de profil LinkedIn
    openrouter.ts     — génération des messages (LLM)
    telegram.ts       — notifications + bouton d'approbation + polling
    resend.ts         — envoi de l'email final
  trigger/
    prospection-cron.ts   — planification + dédup + dispatch
    enrich-prospect.ts    — pipeline complet pour un bar
```

Chaque fichier de `lib/` encapsule un seul service externe ; `trigger/` ne fait
qu'orchestrer ces appels, sans logique métier dupliquée.

## 7. Tests

```bash
npm test              # suite complète (33 tests)
npx vitest run <file> # un fichier ciblé
```

Tous les clients externes sont testés avec `fetch` mocké (aucun appel réseau
réel dans les tests). Seul `src/db/queries.test.ts` tape la vraie base Neon de
dev, et nettoie ses propres lignes de test après chaque test.
