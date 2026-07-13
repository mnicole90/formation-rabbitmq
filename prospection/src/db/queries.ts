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
  const [inserted] = await db
    .insert(prospects)
    .values(data)
    .onConflictDoNothing({ target: prospects.siren })
    .returning({ id: prospects.id });

  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: prospects.id })
    .from(prospects)
    .where(eq(prospects.siren, data.siren));

  if (!existing) {
    throw new Error(`insertProspect: conflict on siren ${data.siren} but no existing row found`);
  }

  return existing.id;
}

export async function insertDirigeant(data: NewDirigeant): Promise<number> {
  const [row] = await db
    .insert(dirigeants)
    .values(data)
    .onConflictDoUpdate({
      target: [dirigeants.prospectId, dirigeants.nom, dirigeants.prenom],
      set: {
        fonction: data.fonction,
        linkedinUrl: data.linkedinUrl,
        linkedinHeadline: data.linkedinHeadline,
      },
    })
    .returning({ id: dirigeants.id });

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
