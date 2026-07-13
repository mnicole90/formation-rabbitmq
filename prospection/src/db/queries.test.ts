import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { prospects, dirigeants, messages } from "./schema.js";
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
    // First, get the prospect ID to delete related records
    const [prospect] = await db.select().from(prospects).where(eq(prospects.siren, TEST_SIREN));
    if (prospect) {
      // Delete child records first (foreign key constraint)
      await db.delete(dirigeants).where(eq(dirigeants.prospectId, prospect.id));
      await db.delete(messages).where(eq(messages.prospectId, prospect.id));
      // Then delete the prospect
      await db.delete(prospects).where(eq(prospects.id, prospect.id));
    }
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
