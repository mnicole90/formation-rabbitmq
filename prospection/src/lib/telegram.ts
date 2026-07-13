const TELEGRAM_API = "https://api.telegram.org";

function botUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

function chatId(): string {
  const id = process.env.TELEGRAM_CHAT_ID;
  if (!id) throw new Error("TELEGRAM_CHAT_ID is not set");
  return id;
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  let response;
  try {
    response = await fetch(botUrl(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Telegram ${method} network error`);
  }

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { ok: boolean; result: T };
  if (!data.ok) {
    throw new Error(`Telegram ${method} returned ok:false`);
  }
  return data.result;
}

export async function sendLinkedinDraft(
  denomination: string,
  message: string,
  profileUrl: string | null,
  profileIsEmpty: boolean = false
): Promise<void> {
  let text: string;
  if (!profileUrl) {
    text = `🔗 LinkedIn — ${denomination}\n\n${message}\n\n(Profil LinkedIn non trouvé)`;
  } else {
    text = `🔗 LinkedIn — ${denomination}\n\n${message}\n\nProfil : ${profileUrl}`;
    if (profileIsEmpty) {
      text += `\n\n⚠️ Profil LinkedIn peu renseigné (pas de bio ni d'expérience visible).`;
    }
  }

  await callTelegram("sendMessage", { chat_id: chatId(), text });
}

export async function sendEmailDraftWithApproval(
  prospectId: number,
  denomination: string,
  subject: string,
  body: string
): Promise<void> {
  const text = `📧 Email — ${denomination}\n\nObjet : ${subject}\n\n${body}`;

  await callTelegram("sendMessage", {
    chat_id: chatId(),
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "✅ Envoyer", callback_data: `approve:${prospectId}` }]],
    },
  });
}

export interface TelegramUpdate {
  updateId: number;
  callbackData: string | null;
  callbackQueryId: string | null;
}

interface RawTelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
  };
}

export async function getUpdatesSince(
  offset: number
): Promise<{ updates: TelegramUpdate[]; nextOffset: number }> {
  const raw = await callTelegram<RawTelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 0,
  });

  const updates = raw.map((u) => ({
    updateId: u.update_id,
    callbackData: u.callback_query?.data ?? null,
    callbackQueryId: u.callback_query?.id ?? null,
  }));

  const nextOffset = updates.length > 0 ? updates[updates.length - 1].updateId + 1 : offset;

  return { updates, nextOffset };
}

export async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  // Best-effort UX acknowledgment only (clears the button's loading spinner).
  // Telegram callback queries expire quickly — a failure here (e.g. "query is
  // too old") must never abort the actual approved action (sending the email).
  try {
    await callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  } catch {
    // swallow — see comment above
  }
}

export async function findApprovalClick(
  prospectId: number,
  offset: number
): Promise<{ approved: boolean; nextOffset: number; callbackQueryId: string | null }> {
  const { updates, nextOffset } = await getUpdatesSince(offset);

  const match = updates.find((u) => u.callbackData === `approve:${prospectId}`);

  return {
    approved: Boolean(match),
    nextOffset,
    callbackQueryId: match?.callbackQueryId ?? null,
  };
}
