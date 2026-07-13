import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  queue: vi.fn(() => ({ name: "enrich-prospect" })),
  task: vi.fn((config: { run: unknown }) => config),
  wait: { for: vi.fn().mockResolvedValue(undefined) },
  logger: { warn: vi.fn(), log: vi.fn() },
}));

vi.mock("../lib/pappers.js");
vi.mock("../lib/firecrawl.js");
vi.mock("../lib/apify.js");
vi.mock("../lib/openrouter.js");
vi.mock("../lib/telegram.js");
vi.mock("../lib/resend.js");
vi.mock("../db/queries.js");

import { getFiche } from "../lib/pappers.js";
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
import { runEnrichProspect } from "./enrich-prospect.js";

const baseFiche = {
  siren: "111222333",
  denomination: "Le Zorba",
  adresse: "10 rue de la Roquette",
  codePostal: "75011",
  activite: "56.30Z",
  website: "https://lezorba.fr",
  email: null,
  dirigeants: [{ nom: "Martin", prenom: "Sophie", fonction: "Gérante" }],
};

const generatedMessages = {
  linkedinMessage: "Bonjour Sophie !",
  emailSubject: "Une idée pour Le Zorba",
  emailBody: "Bonjour...",
};

describe("runEnrichProspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFiche).mockResolvedValue(baseFiche);
    vi.mocked(findLinkedinProfile).mockResolvedValue({
      url: "https://linkedin.com/in/sophie-martin",
      headline: "Gérante chez Le Zorba",
    });
    vi.mocked(generateMessages).mockResolvedValue(generatedMessages);
    vi.mocked(insertProspect).mockResolvedValue(1);
    vi.mocked(insertDirigeant).mockResolvedValue(1);
    vi.mocked(insertMessage).mockResolvedValue(1);
  });

  it("marks a prospect as linkedin_only when no email is found anywhere", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue(null);

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "linkedin_only" });
    expect(sendLinkedinDraft).toHaveBeenCalled();
    expect(sendEmailDraftWithApproval).not.toHaveBeenCalled();
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "linkedin_only");
  });

  it("sends the email and marks it sent when the approval click arrives", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue("contact@lezorba.fr");
    vi.mocked(findApprovalClick).mockResolvedValueOnce({
      approved: true,
      nextOffset: 1,
      callbackQueryId: "cbq-1",
    });

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "email_sent" });
    expect(answerCallback).toHaveBeenCalledWith("cbq-1", expect.any(String));
    expect(sendProspectionEmail).toHaveBeenCalledWith(
      "contact@lezorba.fr",
      generatedMessages.emailSubject,
      generatedMessages.emailBody
    );
    expect(markMessageSent).toHaveBeenCalledWith(1);
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "email_sent");
  });

  it("expires the prospect when no approval arrives before the deadline", async () => {
    vi.mocked(findEmailOnWebsite).mockResolvedValue("contact@lezorba.fr");
    vi.mocked(findApprovalClick).mockResolvedValue({
      approved: false,
      nextOffset: 1,
      callbackQueryId: null,
    });
    process.env.APPROVAL_TIMEOUT_HOURS = "0";

    const result = await runEnrichProspect({ siren: "111222333" });

    expect(result).toEqual({ prospectId: 1, status: "email_expired" });
    expect(sendProspectionEmail).not.toHaveBeenCalled();
    expect(updateProspectStatus).toHaveBeenCalledWith(1, "email_expired");
  });
});
