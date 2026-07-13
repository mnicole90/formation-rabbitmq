import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  sendLinkedinDraft,
  sendEmailDraftWithApproval,
  getUpdatesSince,
  findApprovalClick,
  answerCallback,
} from "./telegram.js";

describe("telegram", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "12345";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a LinkedIn draft message with the profile URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendLinkedinDraft("Le Zorba", "Bonjour Sophie !", "https://linkedin.com/in/sophie-martin");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe("12345");
    expect(body.text).toContain("https://linkedin.com/in/sophie-martin");
    expect(body.text).not.toContain("peu renseigné");
  });

  it("warns when the LinkedIn profile is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendLinkedinDraft(
      "Le Zorba",
      "Bonjour Brahim !",
      "https://linkedin.com/in/brahim-younsi",
      true
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("peu renseigné");
  });

  it("sends an email draft with an approval button", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await sendEmailDraftWithApproval(42, "Le Zorba", "Une idée pour vous", "Bonjour...");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("approve:42");
  });

  it("parses raw updates into TelegramUpdate and advances the offset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            { update_id: 100, callback_query: { id: "cbq-1", data: "approve:42" } },
            { update_id: 101 },
          ],
        }),
      })
    );

    const { updates, nextOffset } = await getUpdatesSince(99);

    expect(updates).toEqual([
      { updateId: 100, callbackData: "approve:42", callbackQueryId: "cbq-1" },
      { updateId: 101, callbackData: null, callbackQueryId: null },
    ]);
    expect(nextOffset).toBe(102);
  });

  it("detects a matching approval click among updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, callback_query: { id: "cbq-5", data: "approve:42" } }],
        }),
      })
    );

    const result = await findApprovalClick(42, 0);

    expect(result.approved).toBe(true);
    expect(result.callbackQueryId).toBe("cbq-5");
    expect(result.nextOffset).toBe(6);
  });

  it("does not confuse approvals for other prospects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, callback_query: { id: "cbq-5", data: "approve:99" } }],
        }),
      })
    );

    const result = await findApprovalClick(42, 0);
    expect(result.approved).toBe(false);
  });

  it("answers a callback query", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await answerCallback("cbq-5", "Email en cours d'envoi ✅");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.callback_query_id).toBe("cbq-5");
  });

  it("does not leak the bot token in network error messages", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed: connection reset"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(getUpdatesSince(0)).rejects.toThrow("network error");
    await expect(getUpdatesSince(0)).rejects.not.toThrow(/test-token/i);
    await expect(getUpdatesSince(0)).rejects.not.toThrow(/api\.telegram\.org/);
  });

  it("never throws from answerCallback, even when Telegram rejects the request (e.g. expired callback query)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: query is too old and response timeout expired",
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(answerCallback("cbq-5", "Test")).resolves.toBeUndefined();
  });

  it("never throws from answerCallback on a network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(answerCallback("cbq-5", "Test")).resolves.toBeUndefined();
  });
});
