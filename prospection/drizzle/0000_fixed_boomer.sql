CREATE TABLE IF NOT EXISTS "dirigeants" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"fonction" text,
	"linkedin_url" text,
	"linkedin_headline" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" integer NOT NULL,
	"channel" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospects" (
	"id" serial PRIMARY KEY NOT NULL,
	"siren" text NOT NULL,
	"denomination" text NOT NULL,
	"adresse" text,
	"code_postal" text,
	"activite" text,
	"website" text,
	"email" text,
	"email_source" text,
	"status" text DEFAULT 'enriched' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_siren_unique" UNIQUE("siren")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dirigeants" ADD CONSTRAINT "dirigeants_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
