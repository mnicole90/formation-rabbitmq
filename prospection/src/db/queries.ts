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
