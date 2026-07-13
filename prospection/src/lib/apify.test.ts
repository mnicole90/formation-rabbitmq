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
