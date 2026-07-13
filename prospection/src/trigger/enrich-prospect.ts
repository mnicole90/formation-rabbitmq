import { logger, queue, task, wait } from "@trigger.dev/sdk";
import { getFiche, type PappersFiche } from "../lib/pappers.js";
import { findEmailOnWebsite } from "../lib/firecrawl.js";
import { findLinkedinProfile } from "../lib/apify.js";
import { generateMessages } from "../lib/openrouter.js";
import {
  sendLinkedinDraft,
  sendEmailDraftWithApproval,
  findApprovalClick,
  answerCallback,
} from "../lib/telegram.js";
import { sendProspectionEmail } from "../lib/resend.js";
import {
  insertProspect,
  insertDirigeant,
  insertMessage,
  updateProspectStatus,
  markMessageSent,
} from "../db/queries.js";

export const enrichProspectQueue = queue({
  name: "enrich-prospect",
  concurrencyLimit: 1,
});

export interface EnrichProspectPayload {
  siren: string;
}

const POLL_INTERVAL_MINUTES = 1;

function approvalDeadline(): number {
  const hours = Number(process.env.APPROVAL_TIMEOUT_HOURS ?? "24");
  return Date.now() + hours * 60 * 60 * 1000;
}

export async function runEnrichProspect(payload: EnrichProspectPayload) {
  const fiche: PappersFiche = await getFiche(payload.siren);

  let email = fiche.email;
  let emailSource: "pappers" | "firecrawl" | null = email ? "pappers" : null;

  if (!email && fiche.website) {
    email = await findEmailOnWebsite(fiche.website);
    if (email) emailSource = "firecrawl";
  }

  const dirigeant = fiche.dirigeants[0];
  if (!dirigeant) {
    logger.warn("Aucun dirigeant trouvé, message LinkedIn générique utilisé", {
      siren: payload.siren,
    });
  }

  const linkedinProfile = dirigeant
    ? await findLinkedinProfile(dirigeant.prenom, dirigeant.nom, fiche.denomination)
    : null;

  const generated = await generateMessages({
    denomination: fiche.denomination,
    activite: fiche.activite,
    adresse: fiche.adresse,
    dirigeantPrenom: dirigeant?.prenom ?? "l'équipe",
    dirigeantNom: dirigeant?.nom ?? "",
    linkedinHeadline: linkedinProfile?.headline ?? null,
  });

  const prospectId = await insertProspect({
    siren: fiche.siren,
    denomination: fiche.denomination,
    adresse: fiche.adresse,
    codePostal: fiche.codePostal,
    activite: fiche.activite,
    website: fiche.website,
    email,
    emailSource,
    status: "enriched",
  });

  if (dirigeant) {
    await insertDirigeant({
      prospectId,
      nom: dirigeant.nom,
      prenom: dirigeant.prenom,
      fonction: dirigeant.fonction,
      linkedinUrl: linkedinProfile?.url ?? null,
      linkedinHeadline: linkedinProfile?.headline ?? null,
    });
  }

  await insertMessage({
    prospectId,
    channel: "linkedin",
    body: generated.linkedinMessage,
    status: "draft",
  });

  await sendLinkedinDraft(fiche.denomination, generated.linkedinMessage, linkedinProfile?.url ?? null);

  if (!email) {
    await updateProspectStatus(prospectId, "linkedin_only");
    return { prospectId, status: "linkedin_only" as const };
  }

  const emailMessageId = await insertMessage({
    prospectId,
    channel: "email",
    subject: generated.emailSubject,
    body: generated.emailBody,
    status: "draft",
  });

  await sendEmailDraftWithApproval(
    prospectId,
    fiche.denomination,
    generated.emailSubject,
    generated.emailBody
  );

  // wait.for pauses checkpoint the run and don't count toward the task's maxDuration,
  // so polling once a minute for up to 24h is cheap.
  const deadline = approvalDeadline();
  let offset = 0;

  while (Date.now() < deadline) {
    await wait.for({ minutes: POLL_INTERVAL_MINUTES });

    const result = await findApprovalClick(prospectId, offset);
    offset = result.nextOffset;

    if (result.approved) {
      if (result.callbackQueryId) {
        await answerCallback(result.callbackQueryId, "Email en cours d'envoi ✅");
      }
      await sendProspectionEmail(email, generated.emailSubject, generated.emailBody);
      await markMessageSent(emailMessageId);
      await updateProspectStatus(prospectId, "email_sent");
      return { prospectId, status: "email_sent" as const };
    }
  }

  await updateProspectStatus(prospectId, "email_expired");
  return { prospectId, status: "email_expired" as const };
}

export const enrichProspect = task({
  id: "enrich-prospect",
  queue: enrichProspectQueue,
  run: runEnrichProspect,
});
