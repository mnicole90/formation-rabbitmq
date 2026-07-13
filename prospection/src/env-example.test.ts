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
