import { Resend } from "resend";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendProspectionEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!from) throw new Error("RESEND_FROM is not set");

  const overrideTo = process.env.EMAIL_OVERRIDE_TO;
  const recipient = overrideTo || to;
  const finalSubject = overrideTo ? `[Test → ${to}] ${subject}` : subject;

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to: recipient,
    subject: finalSubject,
    html: escapeHtml(body).replace(/\n/g, "<br>"),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
