import { logger, schedules } from "@trigger.dev/sdk";
import { searchBars75011 } from "../lib/pappers.js";
import { getExistingSirens } from "../db/queries.js";
import { enrichProspect } from "./enrich-prospect.js";

const MAX_NEW_PROSPECTS_PER_RUN = 10;
const MAX_PAGES_PER_RUN = 25;

export async function collectNewSirens(): Promise<string[]> {
  const collected: string[] = [];

  for (let page = 1; page <= MAX_PAGES_PER_RUN; page++) {
    const results = await searchBars75011(page);
    if (results.length === 0) break;

    const sirens = results.map((r) => r.siren);
    const existing = await getExistingSirens(sirens);
    const newSirens = sirens.filter((s) => !existing.has(s));
    collected.push(...newSirens);

    if (collected.length >= MAX_NEW_PROSPECTS_PER_RUN) break;
  }

  return collected.slice(0, MAX_NEW_PROSPECTS_PER_RUN);
}

export const prospectionCron = schedules.task({
  id: "prospection-cron",
  cron: "0 9 * * *",
  run: async () => {
    const newSirens = await collectNewSirens();

    if (newSirens.length === 0) {
      logger.log("Aucun nouveau bar à traiter");
      return { triggered: 0 };
    }

    await enrichProspect.batchTrigger(newSirens.map((siren) => ({ payload: { siren } })));

    logger.log(`${newSirens.length} nouveaux bars déclenchés`, { sirens: newSirens });
    return { triggered: newSirens.length };
  },
});
