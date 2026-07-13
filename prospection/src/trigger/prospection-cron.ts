import { logger, schedules } from "@trigger.dev/sdk";
import { searchBars75011 } from "../lib/pappers.js";
import { getExistingSirens } from "../db/queries.js";
import { enrichProspect } from "./enrich-prospect.js";

const MAX_NEW_PROSPECTS_PER_RUN = 10;

export async function collectNewSirens(): Promise<string[]> {
  const results = await searchBars75011(1);
  const sirens = results.map((r) => r.siren);
  const existing = await getExistingSirens(sirens);
  return sirens.filter((s) => !existing.has(s)).slice(0, MAX_NEW_PROSPECTS_PER_RUN);
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
