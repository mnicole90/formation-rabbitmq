import { describe, it, expect, vi, afterEach } from "vitest";
import { generateMessages } from "./openrouter.js";

describe("generateMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ctx = {
    denomination: "Le Zorba",
    activite: "56.30Z",
    adresse: "10 rue de la Roquette",
    dirigeantPrenom: "Sophie",
    dirigeantNom: "Martin",
    linkedinHeadline: "Gérante chez Le Zorba",
  };

  it("parses a well-formed JSON response", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  linkedinMessage: "Bonjour Sophie, ravi de découvrir Le Zorba !",
                  emailSubject: "Une idée pour Le Zorba",
                  emailBody: "Bonjour Sophie, ...",
                }),
              },
            },
          ],
        }),
      })
    );

    const result = await generateMessages(ctx);

    expect(result.linkedinMessage).toContain("Sophie");
    expect(result.emailSubject).toBe("Une idée pour Le Zorba");
  });

  it("throws when the LLM response is missing fields", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ linkedinMessage: "Bonjour" }) } }],
        }),
      })
    );

    await expect(generateMessages(ctx)).rejects.toThrow("Réponse LLM incomplète");
  });
});
