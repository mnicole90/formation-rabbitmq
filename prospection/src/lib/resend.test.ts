import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendProspectionEmail } from "./resend.js";

describe("sendProspectionEmail", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM = "prospection@kodesaas.fr";
    delete process.env.EMAIL_OVERRIDE_TO;
    sendMock.mockReset();
  });

  it("sends the email with HTML line breaks", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendProspectionEmail("contact@lezorba.fr", "Une idée", "Ligne 1\nLigne 2");

    expect(sendMock).toHaveBeenCalledWith({
      from: "prospection@kodesaas.fr",
      to: "contact@lezorba.fr",
      subject: "Une idée",
      html: "Ligne 1<br>Ligne 2",
    });
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "Invalid API key" } });

    await expect(
      sendProspectionEmail("contact@lezorba.fr", "Une idée", "Corps")
    ).rejects.toThrow("Resend send failed: Invalid API key");
  });

  it("escapes HTML special characters in the body before converting newlines", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-2" }, error: null });

    await sendProspectionEmail(
      "contact@lezorba.fr",
      "Une idée",
      'Bonjour <b>vous</b> & "associés"\nCordialement'
    );

    expect(sendMock).toHaveBeenCalledWith({
      from: "prospection@kodesaas.fr",
      to: "contact@lezorba.fr",
      subject: "Une idée",
      html: "Bonjour &lt;b&gt;vous&lt;/b&gt; &amp; &quot;associés&quot;<br>Cordialement",
    });
  });

  it("redirects to EMAIL_OVERRIDE_TO when set, keeping the real recipient visible in the subject", async () => {
    process.env.EMAIL_OVERRIDE_TO = "maxime@kodesaas.com";
    sendMock.mockResolvedValue({ data: { id: "email-3" }, error: null });

    await sendProspectionEmail("contact@lezorba.fr", "Une idée", "Corps");

    expect(sendMock).toHaveBeenCalledWith({
      from: "prospection@kodesaas.fr",
      to: "maxime@kodesaas.com",
      subject: "[Test → contact@lezorba.fr] Une idée",
      html: "Corps",
    });
  });
});
