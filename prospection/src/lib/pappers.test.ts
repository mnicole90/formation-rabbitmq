import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchBars75011, getFiche } from "./pappers.js";

describe("pappers", () => {
  beforeEach(() => {
    process.env.PAPPERS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps recherche results to PappersSearchResult", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resultats: [
          {
            siren: "111222333",
            nom_entreprise: "Le Zorba",
            code_naf: "56.30Z",
            siege: { adresse_ligne_1: "10 rue de la Roquette", code_postal: "75011" },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const results = await searchBars75011(1);

    expect(results).toEqual([
      {
        siren: "111222333",
        denomination: "Le Zorba",
        adresse: "10 rue de la Roquette",
        codePostal: "75011",
        activite: "56.30Z",
      },
    ]);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("code_naf=56.30Z");
    expect(calledUrl).toContain("code_postal=75011");
  });

  it("maps fiche entreprise to PappersFiche with dirigeants", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        siren: "111222333",
        nom_entreprise: "Le Zorba",
        code_naf: "56.30Z",
        site_internet: "https://lezorba.fr",
        email: "contact@lezorba.fr",
        siege: { adresse_ligne_1: "10 rue de la Roquette", code_postal: "75011" },
        representants: [{ nom: "Martin", prenom: "Sophie", qualite: "Gérante" }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const fiche = await getFiche("111222333");

    expect(fiche.email).toBe("contact@lezorba.fr");
    expect(fiche.dirigeants).toEqual([{ nom: "Martin", prenom: "Sophie", fonction: "Gérante" }]);
  });

  it("throws when Pappers responds with an error status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getFiche("111222333")).rejects.toThrow("Pappers entreprise failed: 401");
  });
});
