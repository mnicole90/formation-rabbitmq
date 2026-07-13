import { describe, it, expect, vi, afterEach } from "vitest";
import { generateMessages } from "./openrouter.js";

function promptBodyOf(mockFetch: ReturnType<typeof vi.fn>): string {
  const body = JSON.parse(mockFetch.mock.calls[0][1].body);
  return body.messages[0].content as string;
}

describe("generateMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ctx = {
    denomination: "Le Zorba",
    activite: "56.30Z",
    dirigeantPrenom: "Sophie",
    dirigeantNom: "Martin",
    linkedinHeadline: "Gérante chez Le Zorba",
    linkedinAbout: "Passionnée de mixologie depuis 10 ans.",
  };

  it("parses a well-formed JSON response", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
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
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateMessages(ctx);

    expect(result.linkedinMessage).toContain("Sophie");
    expect(result.emailSubject).toBe("Une idée pour Le Zorba");
  });

  it("includes the LinkedIn bio in the prompt and asks to personalize with it when present", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                linkedinMessage: "Bonjour Sophie !",
                emailSubject: "Une idée",
                emailBody: "Bonjour...",
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateMessages(ctx);

    const prompt = promptBodyOf(mockFetch);
    expect(prompt).toContain("Passionnée de mixologie depuis 10 ans.");
    expect(prompt).toContain("personnalise");
  });

  it("marks the LinkedIn bio as unavailable when there is none", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                linkedinMessage: "Bonjour Sophie !",
                emailSubject: "Une idée",
                emailBody: "Bonjour...",
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateMessages({ ...ctx, linkedinHeadline: null, linkedinAbout: null });

    const prompt = promptBodyOf(mockFetch);
    expect(prompt).toContain("Bio LinkedIn : non disponible");
    expect(prompt).toContain("Profil LinkedIn : non disponible");
  });

  it("parses a JSON response wrapped in a markdown code fence", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const payload = {
      linkedinMessage: "Bonjour Sophie, ravi de découvrir Le Zorba !",
      emailSubject: "Une idée pour Le Zorba",
      emailBody: "Bonjour Sophie, ...",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "```json\n" + JSON.stringify(payload) + "\n```",
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
