import { describe, it, expect, vi, afterEach } from "vitest";
import { extractEmail, findEmailOnWebsite, findWebsiteUrl } from "./firecrawl.js";

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

  it("degrades to null instead of throwing when Firecrawl rejects the site (e.g. 403 unsupported)", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ success: false, error: "We do not support this site." }),
      })
    );

    const email = await findEmailOnWebsite("https://unsupported-site.example");
    expect(email).toBeNull();
  });
});

describe("findWebsiteUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first non-directory result", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { url: "https://www.pappers.fr/entreprise/le-zorba-111222333", title: "Le Zorba" },
            { url: "https://www.societe.com/societe/le-zorba-111222333.html", title: "Le Zorba" },
            { url: "https://lezorba-paris.fr", title: "Le Zorba - Bar à cocktails" },
          ],
        }),
      })
    );

    const url = await findWebsiteUrl("Le Zorba", "10 rue de la Roquette, 75011 Paris");
    expect(url).toBe("https://lezorba-paris.fr");
  });

  it("returns null when only directory/registry results are found", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { url: "https://www.pappers.fr/entreprise/le-zorba-111222333", title: "Le Zorba" },
            {
              url: "https://annuaire-entreprises.data.gouv.fr/entreprise/le-zorba-111222333",
              title: "Le Zorba",
            },
          ],
        }),
      })
    );

    const url = await findWebsiteUrl("Le Zorba", "10 rue de la Roquette, 75011 Paris");
    expect(url).toBeNull();
  });

  it("returns null when no results are found", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) })
    );

    const url = await findWebsiteUrl("Le Zorba", "10 rue de la Roquette, 75011 Paris");
    expect(url).toBeNull();
  });

  it("degrades to null instead of throwing when the search request fails", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      })
    );

    const url = await findWebsiteUrl("Le Zorba", "10 rue de la Roquette, 75011 Paris");
    expect(url).toBeNull();
  });
});
