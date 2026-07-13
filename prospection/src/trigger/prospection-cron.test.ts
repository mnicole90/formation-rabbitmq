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
    vi.mocked(searchBars75011).mockResolvedValue([
      { siren: "111", denomination: "A", adresse: "", codePostal: "75011", activite: "56.30Z" },
      { siren: "222", denomination: "B", adresse: "", codePostal: "75011", activite: "56.30Z" },
    ]);
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
  });
});
