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
