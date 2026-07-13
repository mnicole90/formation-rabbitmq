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
