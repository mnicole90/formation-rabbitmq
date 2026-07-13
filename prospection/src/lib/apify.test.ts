import { describe, it, expect, vi, afterEach } from "vitest";
import { findLinkedinProfile } from "./apify.js";

describe("findLinkedinProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first matching profile", async () => {
    process.env.APIFY_TOKEN = "test-token";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { linkedinUrl: "https://linkedin.com/in/sophie-martin", headline: "Gérante chez Le Zorba" },
      ],
    });
    vi.stubGlobal("fetch", mockFetch);

    const profile = await findLinkedinProfile("Sophie", "Martin");

    expect(profile).toEqual({
      url: "https://linkedin.com/in/sophie-martin",
      headline: "Gérante chez Le Zorba",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.searchQuery).toBe("Sophie Martin");
    expect(body.locations).toEqual(["Paris"]);
  });

  it("returns null when no items are found", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const profile = await findLinkedinProfile("Sophie", "Martin");
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

    const profile = await findLinkedinProfile("Jean", "Dupont");
    expect(profile?.url).toBe("https://linkedin.com/in/jean-dupont");
  });

  it("degrades to null instead of throwing when the Apify run fails", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      })
    );

    const profile = await findLinkedinProfile("Sophie", "Martin");
    expect(profile).toBeNull();
  });
});
