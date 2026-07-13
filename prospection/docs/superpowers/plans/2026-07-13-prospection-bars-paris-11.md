# Prospection Bars Paris 11e Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Trigger.dev v4 automation that finds bars in Paris's 11th arrondissement via Pappers, enriches them with an email (Firecrawl fallback) and a LinkedIn profile (Apify), drafts personalized outreach with an LLM (OpenRouter), notifies via Telegram, and sends the prospection email through Resend only after a Telegram approval click — with zero HTTP server.

**Architecture:** Two Trigger.dev tasks. `prospection-cron` (daily schedule) searches new bars and dedupes against Neon by SIREN, then triggers `enrich-prospect` (queue `concurrencyLimit: 1`) once per bar. `enrich-prospect` runs the enrichment pipeline (Pappers → Firecrawl → Apify → OpenRouter), persists to Neon via Drizzle, sends Telegram drafts, and — if an email exists — loops `wait.for({ minutes: 1 })` + `getUpdates` (own offset, no shared poller needed since concurrency is 1) until an approval click, timeout (24h), calling Resend on approval.

**Tech Stack:** TypeScript, `@trigger.dev/sdk` (Trigger.dev v4 CLI), Neon Postgres, Drizzle ORM, `@neondatabase/serverless`, `resend`, Vitest, native `fetch` for Pappers/Firecrawl/Apify/OpenRouter/Telegram HTTP calls.

## Global Constraints

- Zone de recherche : code postal `75011`, NAF `56.30Z` (débits de boissons).
- Traitement strictement unitaire : `enrich-prospect` tourne sur une queue `concurrencyLimit: 1`.
- Dédup stricte par SIREN : contrainte `unique` en base, jamais recontacter deux fois.
- Aucun serveur HTTP, aucun webhook : approbation via `wait.for` + polling `getUpdates` interne au run.
- Timeout d'approbation email : 24h par défaut (`APPROVAL_TIMEOUT_HOURS`).
- Message LinkedIn : notification Telegram uniquement, jamais envoyé automatiquement.
- Email : envoyé via Resend uniquement après clic sur le bouton d'approbation Telegram.
- Modèle LLM : OpenRouter, `OPENROUTER_MODEL` défaut `anthropic/claude-sonnet-5`.

---

## File Structure

```
prospection/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.setup.ts
├── trigger.config.ts
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── src/
│   ├── env-example.test.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   ├── queries.ts
│   │   └── queries.test.ts
│   ├── lib/
│   │   ├── pappers.ts
│   │   ├── pappers.test.ts
│   │   ├── firecrawl.ts
│   │   ├── firecrawl.test.ts
│   │   ├── apify.ts
│   │   ├── apify.test.ts
│   │   ├── openrouter.ts
│   │   ├── openrouter.test.ts
│   │   ├── telegram.ts
│   │   ├── telegram.test.ts
│   │   ├── resend.ts
│   │   └── resend.test.ts
│   └── trigger/
│       ├── enrich-prospect.ts
│       ├── enrich-prospect.test.ts
│       ├── prospection-cron.ts
│       └── prospection-cron.test.ts
└── drizzle/               (généré par drizzle-kit)
```

Each `lib/*.ts` owns exactly one external API. `db/queries.ts` owns all Neon reads/writes. `trigger/*.ts` owns orchestration only — no direct API calls, only calls into `lib/` and `db/`.

---

### Task 1: Project scaffolding & environment contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Test: `src/env-example.test.ts`

**Interfaces:**
- Produces: `.env.example` listing every environment variable later tasks depend on (`PAPPERS_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `RESEND_FROM`, `APPROVAL_TIMEOUT_HOURS`, `DATABASE_URL`, `TRIGGER_SECRET_KEY`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "prospection",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "trigger dev",
    "deploy": "trigger deploy",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "@trigger.dev/sdk": "^4.0.0",
    "@neondatabase/serverless": "^0.10.4",
    "drizzle-orm": "^0.36.4",
    "resend": "^4.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "dotenv": "^16.4.7",
    "drizzle-kit": "^0.28.1",
    "trigger.dev": "^4.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/mnicole/Projects/formations/prospection && npm install`
Expected: installs without error, creates `package-lock.json` and `node_modules`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "trigger.config.ts", "drizzle.config.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

`vitest.setup.ts`:
```ts
import "dotenv/config";
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.env
.trigger
```

- [ ] **Step 6: Write the failing test for `.env.example`**

`src/env-example.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe(".env.example", () => {
  it("documents every required environment variable", () => {
    const content = readFileSync(new URL("../.env.example", import.meta.url), "utf-8");
    const required = [
      "DATABASE_URL",
      "TRIGGER_SECRET_KEY",
      "PAPPERS_API_KEY",
      "FIRECRAWL_API_KEY",
      "APIFY_TOKEN",
      "OPENROUTER_API_KEY",
      "OPENROUTER_MODEL",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "RESEND_API_KEY",
      "RESEND_FROM",
      "APPROVAL_TIMEOUT_HOURS",
    ];

    for (const key of required) {
      expect(content).toContain(key);
    }
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run src/env-example.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.env.example'`

- [ ] **Step 8: Create `.env.example`**

```
DATABASE_URL=
TRIGGER_SECRET_KEY=
PAPPERS_API_KEY=
FIRECRAWL_API_KEY=
APIFY_TOKEN=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-5
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
RESEND_API_KEY=
RESEND_FROM=
APPROVAL_TIMEOUT_HOURS=24
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/env-example.test.ts`
Expected: PASS (1 test passed)

- [ ] **Step 10: Type-check the project**

Run: `npx tsc --noEmit`
Expected: no errors (only `src/env-example.test.ts` exists so far — should compile cleanly)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts vitest.setup.ts .gitignore .env.example src/env-example.test.ts
git commit -m "chore: scaffold project and document required env vars"
```

---

### Task 2: Trigger.dev CLI init & config

**Files:**
- Create: `trigger.config.ts` (generated by CLI, then verified/adjusted)
- Create: `src/trigger/` (directory, generated by CLI)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: a valid `trigger.config.ts` with `dirs: ["./src/trigger"]` that later tasks' `task()`/`schedules.task()` calls are discovered from.

- [ ] **Step 1: Verify current Trigger.dev SDK API surface**

Run: `mcp__trigger__search_docs` with query `"wait.for schedules.task queue concurrencyLimit batchTrigger"` (via the `trigger` MCP tool).
Expected: confirms these APIs are imported from `@trigger.dev/sdk` (no `/v3` suffix — verified 2026-07-13 against live docs; the SDK v4 dropped the `/v3` subpath used in older examples). All task code in this plan already uses the correct `@trigger.dev/sdk` import.

- [ ] **Step 2: Authenticate and initialize the Trigger.dev project**

Run: `cd /Users/mnicole/Projects/formations/prospection && npx trigger.dev@latest login`
Expected: opens a browser to authenticate with the Trigger.dev account.

Run: `npx trigger.dev@latest init`
Expected: interactive prompt — choose "Create a new project", name it `prospection-bars-11e`. This generates `trigger.config.ts` and a `src/trigger` directory (may include a sample file to delete).

- [ ] **Step 3: Verify and adjust `trigger.config.ts`**

Read the generated `trigger.config.ts`. It should look like:

```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "<the generated project ref, e.g. proj_abcdefgh>",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./src/trigger"],
});
```

Ensure `dirs` is set to `["./src/trigger"]`. Leave `project` as generated by the CLI — do not hand-edit it.

- [ ] **Step 4: Remove any sample task file generated by the CLI**

Run: `ls src/trigger/`
If a sample file (e.g. `example.ts`) was generated, delete it: `rm src/trigger/<sample-file>`

- [ ] **Step 5: Set `TRIGGER_SECRET_KEY` locally**

Run: `npx trigger.dev@latest whoami` to confirm the authenticated project, then copy the dev secret key shown in the Trigger.dev dashboard (Project settings → API keys → dev secret key) into a local `.env` file (not committed):

```
TRIGGER_SECRET_KEY=tr_dev_...
```

- [ ] **Step 6: Verify the dev CLI starts**

Run: `npx trigger.dev@latest dev`
Expected: connects to the Trigger.dev dev environment and reports "Waiting for tasks" (no tasks registered yet — that's expected). Stop it with Ctrl+C once confirmed.

- [ ] **Step 7: Commit**

```bash
git add trigger.config.ts
git commit -m "chore: initialize Trigger.dev project"
```

---

### Task 3: Neon database schema (Drizzle)

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: `prospects`, `dirigeants`, `messages` Drizzle tables (exact column names below) and a `db` client, both consumed by Task 4's `src/db/queries.ts`.

- [ ] **Step 1: Provision the Neon project**

Use the `mcp__Neon__create_project` tool with `name: "prospection-bars-11e"`.
Expected: returns a project id and a default branch with a connection string.

- [ ] **Step 2: Retrieve the connection string**

Use `mcp__Neon__get_connection_string` with the project id from Step 1 (default branch, database `neondb`).
Expected: a `postgresql://...` URL. Append it to the local `.env` file (not committed):

```
DATABASE_URL=postgresql://...
```

- [ ] **Step 3: Create `src/db/schema.ts`**

```ts
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  siren: text("siren").notNull().unique(),
  denomination: text("denomination").notNull(),
  adresse: text("adresse"),
  codePostal: text("code_postal"),
  activite: text("activite"),
  website: text("website"),
  email: text("email"),
  emailSource: text("email_source"), // 'pappers' | 'firecrawl'
  status: text("status").notNull().default("enriched"), // enriched | linkedin_only | email_sent | email_expired
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dirigeants = pgTable("dirigeants", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id")
    .notNull()
    .references(() => prospects.id),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  fonction: text("fonction"),
  linkedinUrl: text("linkedin_url"),
  linkedinHeadline: text("linkedin_headline"),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id")
    .notNull()
    .references(() => prospects.id),
  channel: text("channel").notNull(), // 'linkedin' | 'email'
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"), // draft | sent
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
```

- [ ] **Step 4: Create `src/db/client.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 5: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 6: Generate and apply the migration**

Run: `npm run db:generate`
Expected: creates a SQL file under `drizzle/` with `CREATE TABLE` statements for `prospects`, `dirigeants`, `messages`.

Run: `npm run db:push`
Expected: applies the schema to the Neon database, reports 3 tables created.

- [ ] **Step 7: Verify tables exist**

Use `mcp__Neon__get_database_tables` with the project id from Step 1.
Expected: lists `prospects`, `dirigeants`, `messages`.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/client.ts drizzle.config.ts drizzle/
git commit -m "feat(db): add Drizzle schema for prospects, dirigeants, messages"
```

---

### Task 4: Database repository functions

**Files:**
- Create: `src/db/queries.ts`
- Test: `src/db/queries.test.ts`

**Interfaces:**
- Consumes: `db`, `prospects`, `dirigeants`, `messages` from Task 3 (`src/db/schema.ts`, `src/db/client.ts`).
- Produces (consumed by Task 11 `enrich-prospect` and Task 12 `prospection-cron`):
  - `getExistingSirens(sirens: string[]): Promise<Set<string>>`
  - `insertProspect(data: NewProspect): Promise<number>`
  - `insertDirigeant(data: NewDirigeant): Promise<number>`
  - `insertMessage(data: NewMessage): Promise<number>`
  - `updateProspectStatus(prospectId: number, status: string): Promise<void>`
  - `markMessageSent(messageId: number): Promise<void>`
  - Types: `NewProspect`, `NewDirigeant`, `NewMessage` (Drizzle-inferred insert types)

- [ ] **Step 1: Write the failing tests**

`src/db/queries.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { prospects } from "./schema.js";
import {
  getExistingSirens,
  insertProspect,
  insertDirigeant,
  insertMessage,
  updateProspectStatus,
  markMessageSent,
} from "./queries.js";

const TEST_SIREN = "000000001";

describe.skipIf(!process.env.DATABASE_URL)("queries", () => {
  afterEach(async () => {
    await db.delete(prospects).where(eq(prospects.siren, TEST_SIREN));
  });

  it("inserts a prospect and finds it by siren", async () => {
    const id = await insertProspect({
      siren: TEST_SIREN,
      denomination: "Le Bar Test",
      adresse: "1 rue du Test",
      codePostal: "75011",
      activite: "56.30Z",
      status: "enriched",
    });

    const existing = await getExistingSirens([TEST_SIREN, "999999999"]);
    expect(existing.has(TEST_SIREN)).toBe(true);
    expect(existing.has("999999999")).toBe(false);
    expect(id).toBeGreaterThan(0);
  });

  it("inserts a dirigeant linked to a prospect", async () => {
    const prospectId = await insertProspect({
      siren: TEST_SIREN,
      denomination: "Le Bar Test",
      adresse: "1 rue du Test",
      codePostal: "75011",
      activite: "56.30Z",
      status: "enriched",
    });

    const dirigeantId = await insertDirigeant({
      prospectId,
      nom: "Dupont",
      prenom: "Jean",
      fonction: "Gérant",
    });

    expect(dirigeantId).toBeGreaterThan(0);
  });

  it("inserts a message and marks it sent", async () => {
    const prospectId = await insertProspect({
      siren: TEST_SIREN,
      denomination: "Le Bar Test",
      adresse: "1 rue du Test",
      codePostal: "75011",
      activite: "56.30Z",
      status: "enriched",
    });

    const messageId = await insertMessage({
      prospectId,
      channel: "email",
      subject: "Bonjour",
      body: "Contenu",
      status: "draft",
    });

    await markMessageSent(messageId);

    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
    expect(row).toBeDefined();
  });

  it("updates prospect status", async () => {
    const prospectId = await insertProspect({
      siren: TEST_SIREN,
      denomination: "Le Bar Test",
      adresse: "1 rue du Test",
      codePostal: "75011",
      activite: "56.30Z",
      status: "enriched",
    });

    await updateProspectStatus(prospectId, "linkedin_only");

    const [row] = await db.select().from(prospects).where(eq(prospects.id, prospectId));
    expect(row.status).toBe("linkedin_only");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/queries.test.ts`
Expected: FAIL — `Cannot find module './queries'`

- [ ] **Step 3: Implement `src/db/queries.ts`**

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import { prospects, dirigeants, messages } from "./schema.js";

export type NewProspect = typeof prospects.$inferInsert;
export type NewDirigeant = typeof dirigeants.$inferInsert;
export type NewMessage = typeof messages.$inferInsert;

export async function getExistingSirens(sirens: string[]): Promise<Set<string>> {
  if (sirens.length === 0) return new Set();
  const rows = await db
    .select({ siren: prospects.siren })
    .from(prospects)
    .where(inArray(prospects.siren, sirens));
  return new Set(rows.map((r) => r.siren));
}

export async function insertProspect(data: NewProspect): Promise<number> {
  const [row] = await db.insert(prospects).values(data).returning({ id: prospects.id });
  return row.id;
}

export async function insertDirigeant(data: NewDirigeant): Promise<number> {
  const [row] = await db.insert(dirigeants).values(data).returning({ id: dirigeants.id });
  return row.id;
}

export async function insertMessage(data: NewMessage): Promise<number> {
  const [row] = await db.insert(messages).values(data).returning({ id: messages.id });
  return row.id;
}

export async function updateProspectStatus(prospectId: number, status: string): Promise<void> {
  await db
    .update(prospects)
    .set({ status, updatedAt: new Date() })
    .where(eq(prospects.id, prospectId));
}

export async function markMessageSent(messageId: number): Promise<void> {
  await db
    .update(messages)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(messages.id, messageId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/queries.test.ts`
Expected: PASS (4 tests passed) — requires `DATABASE_URL` in `.env` from Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.ts src/db/queries.test.ts
git commit -m "feat(db): add prospect/dirigeant/message repository functions"
```

---

### Task 5: Pappers client

**Files:**
- Create: `src/lib/pappers.ts`
- Test: `src/lib/pappers.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect` and Task 12 `prospection-cron`):
  - `interface PappersSearchResult { siren: string; denomination: string; adresse: string; codePostal: string; activite: string }`
  - `interface PappersDirigeant { nom: string; prenom: string; fonction: string | null }`
  - `interface PappersFiche { siren: string; denomination: string; adresse: string; codePostal: string; activite: string; website: string | null; email: string | null; dirigeants: PappersDirigeant[] }`
  - `searchBars75011(page: number): Promise<PappersSearchResult[]>`
  - `getFiche(siren: string): Promise<PappersFiche>`

- [ ] **Step 1: Write the failing tests**

`src/lib/pappers.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchBars75011, getFiche } from "./pappers.js";

describe("pappers", () => {
  beforeEach(() => {
    process.env.PAPPERS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps recherche results to PappersSearchResult", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultats: [
          {
            siren: "111222333",
            nom_entreprise: "Le Zorba",
            code_naf: "56.30Z",
            siege: { adresse_ligne_1: "10 rue de la Roquette", code_postal: "75011" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const results = await searchBars75011(1);

    expect(results).toEqual([
      {
        siren: "111222333",
        denomination: "Le Zorba",
        adresse: "10 rue de la Roquette",
        codePostal: "75011",
        activite: "56.30Z",
      },
    ]);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("code_naf=56.30Z");
    expect(calledUrl).toContain("code_postal=75011");
  });

  it("maps fiche entreprise to PappersFiche with dirigeants", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        siren: "111222333",
        nom_entreprise: "Le Zorba",
        code_naf: "56.30Z",
        site_internet: "https://lezorba.fr",
        email: "contact@lezorba.fr",
        siege: { adresse_ligne_1: "10 rue de la Roquette", code_postal: "75011" },
        representants: [{ nom: "Martin", prenom: "Sophie", qualite: "Gérante" }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const fiche = await getFiche("111222333");

    expect(fiche.email).toBe("contact@lezorba.fr");
    expect(fiche.dirigeants).toEqual([{ nom: "Martin", prenom: "Sophie", fonction: "Gérante" }]);
  });

  it("throws when Pappers responds with an error status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getFiche("111222333")).rejects.toThrow("Pappers entreprise failed: 401");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/pappers.test.ts`
Expected: FAIL — `Cannot find module './pappers'`

- [ ] **Step 3: Implement `src/lib/pappers.ts`**

```ts
export interface PappersSearchResult {
  siren: string;
  denomination: string;
  adresse: string;
  codePostal: string;
  activite: string;
}

export interface PappersDirigeant {
  nom: string;
  prenom: string;
  fonction: string | null;
}

export interface PappersFiche {
  siren: string;
  denomination: string;
  adresse: string;
  codePostal: string;
  activite: string;
  website: string | null;
  email: string | null;
  dirigeants: PappersDirigeant[];
}

const PAPPERS_BASE_URL = "https://api.pappers.fr/v2";

interface PappersRechercheResponse {
  resultats: Array<{
    siren: string;
    nom_entreprise: string;
    code_naf: string;
    siege: {
      adresse_ligne_1: string;
      code_postal: string;
    };
  }>;
}

function requireApiKey(): string {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) throw new Error("PAPPERS_API_KEY is not set");
  return apiKey;
}

export async function searchBars75011(page: number): Promise<PappersSearchResult[]> {
  const apiKey = requireApiKey();

  const url = new URL(`${PAPPERS_BASE_URL}/recherche`);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("code_naf", "56.30Z");
  url.searchParams.set("code_postal", "75011");
  url.searchParams.set("par_page", "20");
  url.searchParams.set("page", String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Pappers recherche failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as PappersRechercheResponse;

  return data.resultats.map((r) => ({
    siren: r.siren,
    denomination: r.nom_entreprise,
    adresse: r.siege.adresse_ligne_1,
    codePostal: r.siege.code_postal,
    activite: r.code_naf,
  }));
}

interface PappersEntrepriseResponse {
  siren: string;
  nom_entreprise: string;
  code_naf: string;
  site_internet: string | null;
  email: string | null;
  siege: {
    adresse_ligne_1: string;
    code_postal: string;
  };
  representants: Array<{
    nom: string;
    prenom: string;
    qualite: string | null;
  }>;
}

export async function getFiche(siren: string): Promise<PappersFiche> {
  const apiKey = requireApiKey();

  const url = new URL(`${PAPPERS_BASE_URL}/entreprise`);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("siren", siren);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Pappers entreprise failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as PappersEntrepriseResponse;

  return {
    siren: data.siren,
    denomination: data.nom_entreprise,
    adresse: data.siege.adresse_ligne_1,
    codePostal: data.siege.code_postal,
    activite: data.code_naf,
    website: data.site_internet,
    email: data.email,
    dirigeants: data.representants.map((r) => ({
      nom: r.nom,
      prenom: r.prenom,
      fonction: r.qualite,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/pappers.test.ts`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pappers.ts src/lib/pappers.test.ts
git commit -m "feat(lib): add Pappers client for bar search and company detail"
```

**Verification note:** field names (`nom_entreprise`, `siege.adresse_ligne_1`, `site_internet`, `representants[].qualite`, etc.) match Pappers API v2 documented fields. Before the first live cron run (Task 13), call `getFiche` with a real SIREN and a real `PAPPERS_API_KEY` and confirm the mapped `PappersFiche` looks correct — adjust field names here if your Pappers plan names them differently.

---

### Task 6: Firecrawl email extraction client

**Files:**
- Create: `src/lib/firecrawl.ts`
- Test: `src/lib/firecrawl.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect`):
  - `extractEmail(content: string): string | null`
  - `findEmailOnWebsite(url: string): Promise<string | null>`

- [ ] **Step 1: Write the failing tests**

`src/lib/firecrawl.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractEmail, findEmailOnWebsite } from "./firecrawl.js";

describe("extractEmail", () => {
  it("finds a valid email in markdown content", () => {
    const content = "Contactez-nous : contact@lezorba.fr ou par téléphone.";
    expect(extractEmail(content)).toBe("contact@lezorba.fr");
  });

  it("skips excluded tracking domains", () => {
    const content = "Erreur envoyée à report@sentry.io. Écrivez à hello@lebaravin.fr.";
    expect(extractEmail(content)).toBe("hello@lebaravin.fr");
  });

  it("returns null when no email is present", () => {
    expect(extractEmail("Aucune adresse ici.")).toBeNull();
  });
});

describe("findEmailOnWebsite", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts an email from the scraped markdown", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { markdown: "Écrivez-nous : contact@lebar11.fr" },
        }),
      })
    );

    const email = await findEmailOnWebsite("https://lebar11.fr");
    expect(email).toBe("contact@lebar11.fr");
  });

  it("returns null when the scrape has no markdown", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) })
    );

    const email = await findEmailOnWebsite("https://lebar11.fr");
    expect(email).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/firecrawl.test.ts`
Expected: FAIL — `Cannot find module './firecrawl'`

- [ ] **Step 3: Implement `src/lib/firecrawl.ts`**

```ts
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EXCLUDED_DOMAINS = ["sentry.io", "wixpress.com", "example.com"];

export function extractEmail(content: string): string | null {
  const matches = content.match(EMAIL_REGEX);
  if (!matches) return null;

  const valid = matches.find((email) => {
    const domain = email.split("@")[1]?.toLowerCase();
    return domain && !EXCLUDED_DOMAINS.includes(domain);
  });

  return valid ?? null;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
  };
}

export async function findEmailOnWebsite(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl scrape failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as FirecrawlScrapeResponse;
  if (!data.success || !data.data?.markdown) return null;

  return extractEmail(data.data.markdown);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/firecrawl.test.ts`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/firecrawl.ts src/lib/firecrawl.test.ts
git commit -m "feat(lib): add Firecrawl email extraction fallback"
```

---

### Task 7: Apify LinkedIn client

**Files:**
- Create: `src/lib/apify.ts`
- Test: `src/lib/apify.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect`):
  - `interface LinkedinProfile { url: string; headline: string | null }`
  - `findLinkedinProfile(prenom: string, nom: string, denomination: string): Promise<LinkedinProfile | null>`

- [ ] **Step 1: Write the failing tests**

`src/lib/apify.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { findLinkedinProfile } from "./apify.js";

describe("findLinkedinProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first matching profile", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { linkedinUrl: "https://linkedin.com/in/sophie-martin", headline: "Gérante chez Le Zorba" },
        ],
      })
    );

    const profile = await findLinkedinProfile("Sophie", "Martin", "Le Zorba");

    expect(profile).toEqual({
      url: "https://linkedin.com/in/sophie-martin",
      headline: "Gérante chez Le Zorba",
    });
  });

  it("returns null when no items are found", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const profile = await findLinkedinProfile("Sophie", "Martin", "Le Zorba");
    expect(profile).toBeNull();
  });

  it("falls back to publicUrl when linkedinUrl is absent", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ publicUrl: "https://linkedin.com/in/jean-dupont", headline: null }],
      })
    );

    const profile = await findLinkedinProfile("Jean", "Dupont", "Le Bar");
    expect(profile?.url).toBe("https://linkedin.com/in/jean-dupont");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/apify.test.ts`
Expected: FAIL — `Cannot find module './apify'`

- [ ] **Step 3: Implement `src/lib/apify.ts`**

```ts
export interface LinkedinProfile {
  url: string;
  headline: string | null;
}

interface HarvestApiProfileItem {
  linkedinUrl?: string;
  publicUrl?: string;
  headline?: string;
}

export async function findLinkedinProfile(
  prenom: string,
  nom: string,
  denomination: string
): Promise<LinkedinProfile | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");

  const url = "https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queries: [`${prenom} ${nom} ${denomination}`],
      maxItems: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Apify run failed: ${response.status} ${await response.text()}`);
  }

  const items = (await response.json()) as HarvestApiProfileItem[];
  const first = items[0];
  if (!first) return null;

  const profileUrl = first.linkedinUrl ?? first.publicUrl;
  if (!profileUrl) return null;

  return {
    url: profileUrl,
    headline: first.headline ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/apify.test.ts`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/apify.ts src/lib/apify.test.ts
git commit -m "feat(lib): add Apify harvestapi LinkedIn profile search client"
```

**Verification note:** the `harvestapi/linkedin-profile-search` actor's input schema (`queries`, `maxItems`) and output fields (`linkedinUrl`/`publicUrl`, `headline`) should be confirmed against the actor's documented input/output schema on Apify once a real `APIFY_TOKEN` is available — adjust field names here if they differ.

---

### Task 8: OpenRouter message generator

**Files:**
- Create: `src/lib/openrouter.ts`
- Test: `src/lib/openrouter.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect`):
  - `interface ProspectContext { denomination: string; activite: string; adresse: string; dirigeantPrenom: string; dirigeantNom: string; linkedinHeadline: string | null }`
  - `interface GeneratedMessages { linkedinMessage: string; emailSubject: string; emailBody: string }`
  - `generateMessages(ctx: ProspectContext): Promise<GeneratedMessages>`

- [ ] **Step 1: Write the failing tests**

`src/lib/openrouter.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateMessages } from "./openrouter.js";

describe("generateMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ctx = {
    denomination: "Le Zorba",
    activite: "56.30Z",
    adresse: "10 rue de la Roquette",
    dirigeantPrenom: "Sophie",
    dirigeantNom: "Martin",
    linkedinHeadline: "Gérante chez Le Zorba",
  };

  it("parses a well-formed JSON response", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  linkedinMessage: "Bonjour Sophie, ravi de découvrir Le Zorba !",
                  emailSubject: "Une idée pour Le Zorba",
                  emailBody: "Bonjour Sophie, ...",
                }),
              },
            },
          ],
        }),
      })
    );

    const result = await generateMessages(ctx);

    expect(result.linkedinMessage).toContain("Sophie");
    expect(result.emailSubject).toBe("Une idée pour Le Zorba");
  });

  it("throws when the LLM response is missing fields", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ linkedinMessage: "Bonjour" }) } }],
        }),
      })
    );

    await expect(generateMessages(ctx)).rejects.toThrow("Réponse LLM incomplète");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/openrouter.test.ts`
Expected: FAIL — `Cannot find module './openrouter'`

- [ ] **Step 3: Implement `src/lib/openrouter.ts`**

```ts
export interface ProspectContext {
  denomination: string;
  activite: string;
  adresse: string;
  dirigeantPrenom: string;
  dirigeantNom: string;
  linkedinHeadline: string | null;
}

export interface GeneratedMessages {
  linkedinMessage: string;
  emailSubject: string;
  emailBody: string;
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
}

function buildPrompt(ctx: ProspectContext): string {
  return `Tu rédiges des messages de prospection pour KodeSaaS, qui aide les commerces à se digitaliser (site web, réservation, automatisation).

Contexte :
- Bar : ${ctx.denomination}
- Activité : ${ctx.activite}
- Adresse : ${ctx.adresse}
- Dirigeant : ${ctx.dirigeantPrenom} ${ctx.dirigeantNom}
- Profil LinkedIn : ${ctx.linkedinHeadline ?? "non disponible"}

Rédige :
1. Un message LinkedIn court (3-4 phrases, ton chaleureux et pro) pour une demande de connexion, mentionnant un détail concret sur le bar ou son profil.
2. Un email de prospection (objet court + corps de 5-8 phrases) proposant un échange rapide.

Réponds STRICTEMENT en JSON, sans texte autour, au format :
{"linkedinMessage": "...", "emailSubject": "...", "emailBody": "..."}`;
}

function parseGeneratedMessages(raw: string): GeneratedMessages {
  const parsed = JSON.parse(raw) as Partial<GeneratedMessages>;

  if (
    typeof parsed.linkedinMessage !== "string" ||
    typeof parsed.emailSubject !== "string" ||
    typeof parsed.emailBody !== "string"
  ) {
    throw new Error(`Réponse LLM incomplète : ${raw}`);
  }

  return {
    linkedinMessage: parsed.linkedinMessage,
    emailSubject: parsed.emailSubject,
    emailBody: parsed.emailBody,
  };
}

export async function generateMessages(ctx: ProspectContext): Promise<GeneratedMessages> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("OpenRouter response has no content");

  return parseGeneratedMessages(content);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/openrouter.test.ts`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/openrouter.ts src/lib/openrouter.test.ts
git commit -m "feat(lib): add OpenRouter LLM message generator"
```

---

### Task 9: Telegram client

**Files:**
- Create: `src/lib/telegram.ts`
- Test: `src/lib/telegram.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect`):
  - `sendLinkedinDraft(denomination: string, message: string, profileUrl: string | null): Promise<void>`
  - `sendEmailDraftWithApproval(prospectId: number, denomination: string, subject: string, body: string): Promise<void>`
  - `interface TelegramUpdate { updateId: number; callbackData: string | null; callbackQueryId: string | null }`
  - `getUpdatesSince(offset: number): Promise<{ updates: TelegramUpdate[]; nextOffset: number }>`
  - `answerCallback(callbackQueryId: string, text: string): Promise<void>`
  - `findApprovalClick(prospectId: number, offset: number): Promise<{ approved: boolean; nextOffset: number; callbackQueryId: string | null }>`

- [ ] **Step 1: Write the failing tests**

`src/lib/telegram.test.ts`:
```ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  sendLinkedinDraft,
  sendEmailDraftWithApproval,
  getUpdatesSince,
  findApprovalClick,
  answerCallback,
} from "./telegram.js";

describe("telegram", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a LinkedIn draft message with the profile URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendLinkedinDraft("Le Zorba", "Bonjour Sophie !", "https://linkedin.com/in/sophie-martin");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("12345");
    expect(body.text).toContain("https://linkedin.com/in/sophie-martin");
  });

  it("sends an email draft with an approval button", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmailDraftWithApproval(42, "Le Zorba", "Une idée pour vous", "Bonjour...");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("approve:42");
  });

  it("parses raw updates into TelegramUpdate and advances the offset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            { update_id: 100, callback_query: { id: "cbq-1", data: "approve:42" } },
            { update_id: 101 },
          ],
        }),
      })
    );

    const { updates, nextOffset } = await getUpdatesSince(99);

    expect(updates).toEqual([
      { updateId: 100, callbackData: "approve:42", callbackQueryId: "cbq-1" },
      { updateId: 101, callbackData: null, callbackQueryId: null },
    ]);
    expect(nextOffset).toBe(102);
  });

  it("detects a matching approval click among updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, callback_query: { id: "cbq-5", data: "approve:42" } }],
        }),
      })
    );

    const result = await findApprovalClick(42, 0);

    expect(result.approved).toBe(true);
    expect(result.callbackQueryId).toBe("cbq-5");
    expect(result.nextOffset).toBe(6);
  });

  it("does not confuse approvals for other prospects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, callback_query: { id: "cbq-5", data: "approve:99" } }],
        }),
      })
    );

    const result = await findApprovalClick(42, 0);
    expect(result.approved).toBe(false);
  });

  it("answers a callback query", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await answerCallback("cbq-5", "Email en cours d'envoi ✅");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.callback_query_id).toBe("cbq-5");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/telegram.test.ts`
Expected: FAIL — `Cannot find module './telegram'`

- [ ] **Step 3: Implement `src/lib/telegram.ts`**

```ts
const TELEGRAM_API = "https://api.telegram.org";

function botUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

function chatId(): string {
  const id = process.env.TELEGRAM_CHAT_ID;
  if (!id) throw new Error("TELEGRAM_CHAT_ID is not set");
  return id;
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(botUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { ok: boolean; result: T };
  if (!data.ok) {
    throw new Error(`Telegram ${method} returned ok:false`);
  }
  return data.result;
}

export async function sendLinkedinDraft(
  denomination: string,
  message: string,
  profileUrl: string | null
): Promise<void> {
  const text = profileUrl
    ? `🔗 LinkedIn — ${denomination}\n\n${message}\n\nProfil : ${profileUrl}`
    : `🔗 LinkedIn — ${denomination}\n\n${message}\n\n(Profil LinkedIn non trouvé)`;

  await callTelegram("sendMessage", { chat_id: chatId(), text });
}

export async function sendEmailDraftWithApproval(
  prospectId: number,
  denomination: string,
  subject: string,
  body: string
): Promise<void> {
  const text = `📧 Email — ${denomination}\n\nObjet : ${subject}\n\n${body}`;

  await callTelegram("sendMessage", {
    chat_id: chatId(),
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "✅ Envoyer", callback_data: `approve:${prospectId}` }]],
    },
  });
}

export interface TelegramUpdate {
  updateId: number;
  callbackData: string | null;
  callbackQueryId: string | null;
}

interface RawTelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
  };
}

export async function getUpdatesSince(
  offset: number
): Promise<{ updates: TelegramUpdate[]; nextOffset: number }> {
  const raw = await callTelegram<RawTelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 0,
  });

  const updates = raw.map((u) => ({
    updateId: u.update_id,
    callbackData: u.callback_query?.data ?? null,
    callbackQueryId: u.callback_query?.id ?? null,
  }));

  const nextOffset = updates.length > 0 ? updates[updates.length - 1].updateId + 1 : offset;

  return { updates, nextOffset };
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  await callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function findApprovalClick(
  prospectId: number,
  offset: number
): Promise<{ approved: boolean; nextOffset: number; callbackQueryId: string | null }> {
  const { updates, nextOffset } = await getUpdatesSince(offset);

  const match = updates.find((u) => u.callbackData === `approve:${prospectId}`);

  return {
    approved: Boolean(match),
    nextOffset,
    callbackQueryId: match?.callbackQueryId ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/telegram.test.ts`
Expected: PASS (6 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram.ts src/lib/telegram.test.ts
git commit -m "feat(lib): add Telegram drafts, approval button and getUpdates polling"
```

---

### Task 10: Resend client

**Files:**
- Create: `src/lib/resend.ts`
- Test: `src/lib/resend.test.ts`

**Interfaces:**
- Produces (consumed by Task 11 `enrich-prospect`):
  - `sendProspectionEmail(to: string, subject: string, body: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/lib/resend.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendProspectionEmail } from "./resend.js";

describe("sendProspectionEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "prospection@kodesaas.fr";
    sendMock.mockReset();
  });

  it("sends the email with HTML line breaks", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendProspectionEmail("contact@lezorba.fr", "Une idée", "Ligne 1\nLigne 2");

    expect(sendMock).toHaveBeenCalledWith({
      from: "prospection@kodesaas.fr",
      to: "contact@lezorba.fr",
      subject: "Une idée",
      html: "Ligne 1<br>Ligne 2",
    });
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });

    await expect(
      sendProspectionEmail("contact@lezorba.fr", "Une idée", "Corps")
    ).rejects.toThrow("Resend send failed: Invalid API key");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/resend.test.ts`
Expected: FAIL — `Cannot find module './resend'`

- [ ] **Step 3: Implement `src/lib/resend.ts`**

```ts
import { Resend } from "resend";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendProspectionEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("RESEND_FROM is not set");

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: escapeHtml(body).replace(/\n/g, "<br>"),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
```

**Security note (added post-Task-10):** `body` originates from LLM-generated content (Task 8's `generateMessages`). Passing it as raw `html` without escaping would let any literal `<`, `>`, `&`, or quote characters in the LLM output be interpreted as HTML by the recipient's email client — a phishing-amplification / HTML-injection risk. `escapeHtml` neutralizes this before the newline-to-`<br>` conversion.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/resend.test.ts`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/lib/resend.ts src/lib/resend.test.ts
git commit -m "feat(lib): add Resend prospection email sender"
```

---

### Task 11: enrich-prospect Trigger task

**Files:**
- Create: `src/trigger/enrich-prospect.ts`
- Test: `src/trigger/enrich-prospect.test.ts`

**Interfaces:**
- Consumes:
  - `getFiche` (Task 5, `src/lib/pappers.ts`)
  - `findEmailOnWebsite` (Task 6, `src/lib/firecrawl.ts`)
  - `findLinkedinProfile` (Task 7, `src/lib/apify.ts`)
  - `generateMessages` (Task 8, `src/lib/openrouter.ts`)
  - `sendLinkedinDraft`, `sendEmailDraftWithApproval`, `findApprovalClick`, `answerCallback` (Task 9, `src/lib/telegram.ts`)
  - `sendProspectionEmail` (Task 10, `src/lib/resend.ts`)
  - `insertProspect`, `insertDirigeant`, `insertMessage`, `updateProspectStatus`, `markMessageSent` (Task 4, `src/db/queries.ts`)
- Produces (consumed by Task 12 `prospection-cron`):
  - `export const enrichProspect` — the Trigger.dev task, with `.batchTrigger(items: Array<{ payload: EnrichProspectPayload }>)`
  - `interface EnrichProspectPayload { siren: string }`
  - `export async function runEnrichProspect(payload: EnrichProspectPayload): Promise<{ prospectId: number; status: "linkedin_only" | "email_sent" | "email_expired" }>` (plain function, used directly in tests, wrapped by the Trigger.dev `task()` for the exported `enrichProspect`)

- [ ] **Step 1: Write the failing tests**

`src/trigger/enrich-prospect.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  queue: vi.fn(() => ({ name: "enrich-prospect" })),
  task: vi.fn((config: { run: unknown }) => config),
  wait: { for: vi.fn().mockResolvedValue(undefined) },
  logger: { warn: vi.fn(), log: vi.fn() },
}));

vi.mock("../lib/pappers.js");
vi.mock("../lib/firecrawl.js");
vi.mock("../lib/apify.js");
vi.mock("../lib/openrouter.js");
vi.mock("../lib/telegram.js");
vi.mock("../lib/resend.js");
vi.mock("../db/queries.js");

import { getFiche } from "../lib/pappers.js";
import { findEmailOnWebsite } from "../lib/firecrawl.js";
import { findLinkedinProfile } from "../lib/apify.js";
import { generateMessages } from "../lib/openrouter.js";
import {
  sendLinkedinDraft,
  sendEmailDraftWithApproval,
  findApprovalClick,
  answerCallback,
} from "../lib/telegram.js";
import { sendProspectionEmail } from "../lib/resend.js";
import {
  insertProspect,
  insertDirigeant,
  insertMessage,
  updateProspectStatus,
  markMessageSent,
} from "../db/queries.js";
import { runEnrichProspect } from "./enrich-prospect.js";

const baseFiche = {
  siren: "111222333",
  denomination: "Le Zorba",
  adresse: "10 rue de la Roquette",
  codePostal: "75011",
  activite: "56.30Z",
  website: "https://lezorba.fr",
  email: null,
  dirigeants: [{ nom: "Martin", prenom: "Sophie", fonction: "Gérante" }],
};

const generatedMessages = {
  linkedinMessage: "Bonjour Sophie !",
  emailSubject: "Une idée pour Le Zorba",
  emailBody: "Bonjour...",
};

describe("runEnrichProspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFiche).mockResolvedValue(baseFiche);
    vi.mocked(findLinkedinProfile).mockResolvedValue({
      url: "https://linkedin.com/in/sophie-martin",
      headline: "Gérante chez Le Zorba",
    });
    vi.mocked(generateMessages).mockResolvedValue(generatedMessages);
    vi.mocked(insertProspect).mockResolvedValue(1);
    vi.mocked(insertDirigeant).mockResolvedValue(1);
    vi.mocked(insertMessage).mockResolvedValue(1);
  });

  it("marks a prospect as linkedin_only when no email is found anywhere", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue(null);

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "linkedin_only" });
    expect(sendLinkedinDraft).toHaveBeenCalled();
    expect(sendEmailDraftWithApproval).not.toHaveBeenCalled();
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "linkedin_only");
  });

  it("sends the email and marks it sent when the approval click arrives", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue("contact@lezorba.fr");
    vi.mocked(findApprovalClick).mockResolvedValueOnce({
      approved: true,
      nextOffset: 1,
      callbackQueryId: "cbq-1",
    });

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "email_sent" });
    expect(answerCallback).toHaveBeenCalledWith("cbq-1", expect.any(String));
    expect(sendProspectionEmail).toHaveBeenCalledWith(
      "contact@lezorba.fr",
      generatedMessages.emailSubject,
      generatedMessages.emailBody
    );
    expect(markMessageSent).toHaveBeenCalledWith(1);
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "email_sent");
  });

  it("expires the prospect when no approval arrives before the deadline", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue("contact@lezorba.fr");
    vi.mocked(findApprovalClick).mockResolvedValue({
      approved: false,
      nextOffset: 1,
      callbackQueryId: null,
    });
    process.env.APPROVAL_TIMEOUT_HOURS = "0";

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "email_expired" });
    expect(sendProspectionEmail).not.toHaveBeenCalled();
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "email_expired");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/trigger/enrich-prospect.test.ts`
Expected: FAIL — `Cannot find module './enrich-prospect'`

- [ ] **Step 3: Implement `src/trigger/enrich-prospect.ts`**

```ts
import { logger, queue, task, wait } from "@trigger.dev/sdk";
import { getFiche, type PappersFiche } from "../lib/pappers.js";
import { findEmailOnWebsite } from "../lib/firecrawl.js";
import { findLinkedinProfile } from "../lib/apify.js";
import { generateMessages } from "../lib/openrouter.js";
import {
  sendLinkedinDraft,
  sendEmailDraftWithApproval,
  findApprovalClick,
  answerCallback,
} from "../lib/telegram.js";
import { sendProspectionEmail } from "../lib/resend.js";
import {
  insertProspect,
  insertDirigeant,
  insertMessage,
  updateProspectStatus,
  markMessageSent,
} from "../db/queries.js";

export const enrichProspectQueue = queue({
  name: "enrich-prospect",
  concurrencyLimit: 1,
});

export interface EnrichProspectPayload {
  siren: string;
}

const POLL_INTERVAL_MINUTES = 1;

function approvalDeadline(): number {
  const hours = Number(process.env.APPROVAL_TIMEOUT_HOURS ?? "24");
  return Date.now() + hours * 60 * 60 * 1000;
}

export async function runEnrichProspect(payload: EnrichProspectPayload) {
  const fiche: PappersFiche = await getFiche(payload.siren);

  let email = fiche.email;
  let emailSource: "pappers" | "firecrawl" | null = email ? "pappers" : null;

  if (!email && fiche.website) {
    email = await findEmailOnWebsite(fiche.website);
    if (email) emailSource = "firecrawl";
  }

  const dirigeant = fiche.dirigeants[0];
  if (!dirigeant) {
    logger.warn("Aucun dirigeant trouvé, message LinkedIn générique utilisé", {
      siren: payload.siren,
    });
  }

  const linkedinProfile = dirigeant
    ? await findLinkedinProfile(dirigeant.prenom, dirigeant.nom, fiche.denomination)
    : null;

  const generated = await generateMessages({
    denomination: fiche.denomination,
    activite: fiche.activite,
    adresse: fiche.adresse,
    dirigeantPrenom: dirigeant?.prenom ?? "l'équipe",
    dirigeantNom: dirigeant?.nom ?? "",
    linkedinHeadline: linkedinProfile?.headline ?? null,
  });

  const prospectId = await insertProspect({
    siren: fiche.siren,
    denomination: fiche.denomination,
    adresse: fiche.adresse,
    codePostal: fiche.codePostal,
    activite: fiche.activite,
    website: fiche.website,
    email,
    emailSource,
    status: "enriched",
  });

  if (dirigeant) {
    await insertDirigeant({
      prospectId,
      nom: dirigeant.nom,
      prenom: dirigeant.prenom,
      fonction: dirigeant.fonction,
      linkedinUrl: linkedinProfile?.url ?? null,
      linkedinHeadline: linkedinProfile?.headline ?? null,
    });
  }

  await insertMessage({
    prospectId,
    channel: "linkedin",
    body: generated.linkedinMessage,
    status: "draft",
  });

  await sendLinkedinDraft(fiche.denomination, generated.linkedinMessage, linkedinProfile?.url ?? null);

  if (!email) {
    await updateProspectStatus(prospectId, "linkedin_only");
    return { prospectId, status: "linkedin_only" as const };
  }

  const emailMessageId = await insertMessage({
    prospectId,
    channel: "email",
    subject: generated.emailSubject,
    body: generated.emailBody,
    status: "draft",
  });

  await sendEmailDraftWithApproval(
    prospectId,
    fiche.denomination,
    generated.emailSubject,
    generated.emailBody
  );

  // wait.for pauses checkpoint the run and don't count toward the task's maxDuration,
  // so polling once a minute for up to 24h is cheap.
  const deadline = approvalDeadline();
  let offset = 0;

  while (Date.now() < deadline) {
    await wait.for({ minutes: POLL_INTERVAL_MINUTES });

    const result = await findApprovalClick(prospectId, offset);
    offset = result.nextOffset;

    if (result.approved) {
      if (result.callbackQueryId) {
        await answerCallback(result.callbackQueryId, "Email en cours d'envoi ✅");
      }
      await sendProspectionEmail(email, generated.emailSubject, generated.emailBody);
      await markMessageSent(emailMessageId);
      await updateProspectStatus(prospectId, "email_sent");
      return { prospectId, status: "email_sent" as const };
    }
  }

  await updateProspectStatus(prospectId, "email_expired");
  return { prospectId, status: "email_expired" as const };
}

export const enrichProspect = task({
  id: "enrich-prospect",
  queue: enrichProspectQueue,
  run: runEnrichProspect,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/trigger/enrich-prospect.test.ts`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/trigger/enrich-prospect.ts src/trigger/enrich-prospect.test.ts
git commit -m "feat(trigger): add enrich-prospect task with approval polling loop"
```

---

### Task 12: prospection-cron Trigger task

**Files:**
- Create: `src/trigger/prospection-cron.ts`
- Test: `src/trigger/prospection-cron.test.ts`

**Interfaces:**
- Consumes:
  - `searchBars75011` (Task 5, `src/lib/pappers.ts`)
  - `getExistingSirens` (Task 4, `src/db/queries.ts`)
  - `enrichProspect` (Task 11, `src/trigger/enrich-prospect.ts`)
- Produces:
  - `export const prospectionCron` — the Trigger.dev schedule task
  - `export async function collectNewSirens(): Promise<string[]>` (plain function, tested directly)

- [ ] **Step 1: Write the failing tests**

`src/trigger/prospection-cron.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: { run: unknown }) => config) },
  logger: { log: vi.fn() },
}));
vi.mock("../lib/pappers.js");
vi.mock("../db/queries.js");
vi.mock("./enrich-prospect.js", () => ({
  enrichProspect: { batchTrigger: vi.fn() },
}));

import { searchBars75011 } from "../lib/pappers.js";
import { getExistingSirens } from "../db/queries.js";
import { collectNewSirens } from "./prospection-cron.js";

describe("collectNewSirens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes SIRENs already present in the database", async () => {
    vi.mocked(searchBars75011).mockResolvedValue([
      { siren: "111", denomination: "A", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "222", denomination: "B", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ]);
    vi.mocked(getExistingSirens).mockResolvedValue(new Set(["111"]));

    const result = await collectNewSirens();

    expect(result).toEqual(["222"]);
  });

  it("caps the number of new prospects per run at 10", async () => {
    const manyResults = Array.from({ length: 15 }, (_, i) => ({
      siren: String(i),
      denomination: "Bar",
      adresse: "",
      codePostal: "75011",
      activite: "56.30Z",
    }));
    vi.mocked(searchBars75011).mockResolvedValue(manyResults);
    vi.mocked(getExistingSirens).mockResolvedValue(new Set());

    const result = await collectNewSirens();

    expect(result).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/trigger/prospection-cron.test.ts`
Expected: FAIL — `Cannot find module './prospection-cron'`

- [ ] **Step 3: Implement `src/trigger/prospection-cron.ts`**

```ts
import { logger, schedules } from "@trigger.dev/sdk";
import { searchBars75011 } from "../lib/pappers.js";
import { getExistingSirens } from "../db/queries.js";
import { enrichProspect } from "./enrich-prospect.js";

const MAX_NEW_PROSPECTS_PER_RUN = 10;

export async function collectNewSirens(): Promise<string[]> {
  const results = await searchBars75011(1);
  const sirens = results.map((r) => r.siren);
  const existing = await getExistingSirens(sirens);
  return sirens.filter((s) => !existing.has(s)).slice(0, MAX_NEW_PROSPECTS_PER_RUN);
}

export const prospectionCron = schedules.task({
  id: "prospection-cron",
  cron: "0 9 * * *",
  run: async () => {
    const newSirens = await collectNewSirens();

    if (newSirens.length === 0) {
      logger.log("Aucun nouveau bar à traiter");
      return { triggered: 0 };
    }

    await enrichProspect.batchTrigger(newSirens.map((siren) => ({ payload: { siren } })));

    logger.log(`${newSirens.length} nouveaux bars déclenchés`, { sirens: newSirens });
    return { triggered: newSirens.length };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/trigger/prospection-cron.test.ts`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/trigger/prospection-cron.ts src/trigger/prospection-cron.test.ts
git commit -m "feat(trigger): add prospection-cron schedule with SIREN dedup"
```

---

### Task 13: Manual end-to-end verification & README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–12.
- Produces: nothing consumed by other tasks — this is the final verification task.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (env-example, db/queries [if `DATABASE_URL` set], pappers, firecrawl, apify, openrouter, telegram, resend, enrich-prospect, prospection-cron).

- [ ] **Step 2: Fill in real API keys in `.env`**

Ensure `.env` (untracked) has real values for `PAPPERS_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `RESEND_FROM`, plus the `DATABASE_URL` and `TRIGGER_SECRET_KEY` from Tasks 2–3.

- [ ] **Step 3: Start the Trigger.dev dev server**

Run: `npx trigger.dev@latest dev`
Expected: registers both `prospection-cron` and `enrich-prospect` tasks, reports "Waiting for tasks".

- [ ] **Step 4: Trigger `enrich-prospect` manually on one real SIREN**

In the Trigger.dev dashboard (or via `mcp__trigger__trigger_task`), trigger the `enrich-prospect` task with payload `{ "siren": "<a real bar SIREN from the 75011, e.g. found via the Pappers search UI>" }`.

Expected: the run completes the Pappers → (Firecrawl) → Apify → OpenRouter → Neon → Telegram chain. Confirm:
- a Telegram message with the LinkedIn draft arrives in the configured chat;
- if an email was found, a second Telegram message with an "✅ Envoyer" button arrives;
- a row exists in the Neon `prospects` table with `status = 'enriched'` (check via `mcp__Neon__run_sql` with `select * from prospects order by id desc limit 1;`).

- [ ] **Step 5: Exercise the approval path**

Click "✅ Envoyer" on the Telegram message from Step 4.
Expected: within ~1 minute the run detects the click, Resend sends the email, and `prospects.status` becomes `email_sent` (verify with `mcp__Neon__run_sql`).

- [ ] **Step 6: Write `README.md`**

```markdown
# Prospection — Bars Paris 11e

Automatisation Trigger.dev qui recherche les bars du 11e arrondissement (Pappers, NAF 56.30Z),
enrichit dirigeants/emails/profils LinkedIn, génère des messages personnalisés (OpenRouter),
notifie sur Telegram et envoie l'email via Resend après approbation manuelle.

## Setup

1. `npm install`
2. Copier `.env.example` vers `.env` et renseigner toutes les clés.
3. `npm run db:push` pour appliquer le schéma Drizzle sur Neon.
4. `npx trigger.dev@latest dev` pour lancer le worker en local.

## Tasks

- `prospection-cron` — planifiée quotidiennement (9h), recherche jusqu'à 10 nouveaux bars et déclenche `enrich-prospect`.
- `enrich-prospect` — traite un bar : enrichissement, rédaction, notification Telegram, puis boucle d'approbation (24h) avant envoi email via Resend.

## Tests

`npm test` — tests unitaires avec APIs mockées. Les tests de `src/db/queries.test.ts`
nécessitent un `DATABASE_URL` valide dans `.env` (sinon ils sont automatiquement ignorés).

Voir `docs/superpowers/specs/2026-07-13-prospection-bars-paris-11-design.md` pour le design complet.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: add setup and usage README"
```
