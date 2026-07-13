import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: vi.fn((config: { run: unknown }) => config) },
  logger: { log: vi.fn() },
}));
vi.mock("../lib/pappers.js");
vi.mock("../db/queries.js");
vi.mock("./enrich-prospect.js", () => ({
  enrichProspect: { batchTrigger: vi.fn() },
}));

import { searchBars75011 } from "../lib/pappers.js";
import { getExistingSirens } from "../db/queries.js";
import { collectNewSirens } from "./prospection-cron.js";

describe("collectNewSirens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes SIRENs already present in the database", async () => {
    vi.mocked(searchBars75011).mockResolvedValueOnce([
      { siren: "111", denomination: "A", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "222", denomination: "B", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ]);
    vi.mocked(searchBars75011).mockResolvedValue([]);
    vi.mocked(getExistingSirens).mockResolvedValue(new Set(["111"]));

    const result = await collectNewSirens();

    expect(result).toEqual(["222"]);
  });

  it("caps the number of new prospects per run at 10", async () => {
    const manyResults = Array.from({ length: 15 }, (_, i) => ({
      siren: String(i),
      denomination: "Bar",
      adresse: "",
      codePostal: "75011",
      activite: "56.30Z",
    }));
    vi.mocked(searchBars75011).mockResolvedValue(manyResults);
    vi.mocked(getExistingSirens).mockResolvedValue(new Set());

    const result = await collectNewSirens();

    expect(result).toHaveLength(10);
    expect(searchBars75011).toHaveBeenCalledTimes(1);
  });

  it("continues to page 2 when page 1 doesn't yield enough new SIRENs", async () => {
    const page1Results = [
      { siren: "1", denomination: "A", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "2", denomination: "B", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "3", denomination: "C", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ];
    const page2Results = [
      { siren: "4", denomination: "D", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "5", denomination: "E", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ];
    vi.mocked(searchBars75011).mockImplementation(async (page: number) => {
      if (page === 1) return page1Results;
      if (page === 2) return page2Results;
      return [];
    });
    vi.mocked(getExistingSirens)
      .mockResolvedValueOnce(new Set(["1", "2", "3"]))
      .mockResolvedValueOnce(new Set());

    const result = await collectNewSirens();

    expect(searchBars75011).toHaveBeenNthCalledWith(1, 1);
    expect(searchBars75011).toHaveBeenNthCalledWith(2, 2);
    expect(result).toEqual(expect.arrayContaining(["4", "5"]));
  });

  it("stops pagination when Pappers returns an empty results array", async () => {
    const page1Results = [
      { siren: "1", denomination: "A", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "2", denomination: "B", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ];
    vi.mocked(searchBars75011).mockImplementation(async (page: number) => {
      if (page === 1) return page1Results;
      return [];
    });
    vi.mocked(getExistingSirens).mockResolvedValue(new Set());

    const result = await collectNewSirens();

    expect(searchBars75011).toHaveBeenCalledTimes(2);
    expect(result).toEqual(["1", "2"]);
  });
});
