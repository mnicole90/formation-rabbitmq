import { describe, it, expect, vi, afterEach } from "vitest";
import { findLinkedinProfile } from "./apify.js";

describe("findLinkedinProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a profile with real content as not empty", async () => {
    process.env.APIFY_TOKEN = "test-token";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          linkedinUrl: "https://linkedin.com/in/sophie-martin",
          headline: "Gérante chez Le Zorba",
          about: "Passionnée de mixologie depuis 10 ans.",
          experience: [{ position: "Gérante", companyName: "Le Zorba" }],
        },
      ],
    });
    vi.stubGlobal("fetch", mockFetch);

    const profile = await findLinkedinProfile("Sophie", "Martin");

    expect(profile).toEqual({
      url: "https://linkedin.com/in/sophie-martin",
      headline: "Gérante chez Le Zorba",
      about: "Passionnée de mixologie depuis 10 ans.",
      isEmpty: false,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.searchQuery).toBe("Sophie Martin");
    expect(body.locations).toEqual(["Paris"]);
  });

  it("marks a profile as empty when there is no headline, about, or experience", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            linkedinUrl: "https://linkedin.com/in/brahim-younsi",
            headline: "--",
            about: null,
            experience: [],
          },
        ],
      })
    );

    const profile = await findLinkedinProfile("Brahim", "Younsi");

    expect(profile).toEqual({
      url: "https://linkedin.com/in/brahim-younsi",
      headline: null,
      about: null,
      isEmpty: true,
    });
  });

  it("treats a profile with only an about section as not empty", async () => {
    process.env.APIFY_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            linkedinUrl: "https://linkedin.com/in/jean-dupont",
            headline: "--",
            about: "10 ans d'expérience en restauration.",
            experience: [],
          },
        ],
      })
    );

    const profile = await findLinkedinProfile("Jean", "Dupont");

    expect(profile?.isEmpty).toBe(false);
    expect(profile?.about).toBe("10 ans d'expérience en restauration.");
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
