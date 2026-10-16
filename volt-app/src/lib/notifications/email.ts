// ─── Volt Transportation — Email Service (server-only) ────────────────────────
//
// Sends mail straight through Volt's Hostinger mailbox over SMTP — no third-party
// email provider. Without the SMTP_* env vars it only logs (dev/staging mode)
// and reports `simulated: true`.
//
// Env vars (Hostinger hPanel → Emails → the mailbox → "Configure devices"):
//   SMTP_HOST      — smtp.hostinger.com
//   SMTP_PORT      — 465 (SSL)
//   SMTP_USER      — the full mailbox address, e.g. support@contactvolt.com
//   SMTP_PASS      — that mailbox's password
//   EMAIL_FROM     — optional display From, e.g. "Volt Transportation <support@contactvolt.com>"
//                    (must be the SMTP_USER mailbox or an alias of it)
//   SUPPORT_EMAIL  — optional, where Contact-page messages go (default support@contactvolt.com)
// ──────────────────────────────────────────────────────────────────────────────

import nodemailer, { type Transporter } from "nodemailer";

export const SUPPORT_EMAIL_DEFAULT = "support@contactvolt.com";

export function supportEmail(): string {
  return process.env.SUPPORT_EMAIL?.includes("@") ? process.env.SUPPORT_EMAIL : SUPPORT_EMAIL_DEFAULT;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  replyTo?: string | null;
}

export interface EmailResult {
  success: boolean;
  id?: string;         // SMTP message id when sent
  error?: string;
  simulated?: boolean; // true when SMTP isn't configured
}

const set = (v: string | undefined) => !!v && !v.includes("placeholder") && !v.includes("your-");

/** True when emails would really be sent (not just logged). */
export function isEmailConfigured(): boolean {
  return set(process.env.SMTP_HOST) && set(process.env.SMTP_USER) && set(process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function fromAddress(): string {
  const from = process.env.EMAIL_FROM;
  return from && from.includes("@") ? from : `Volt Transportation <${process.env.SMTP_USER}>`;
}

/** Real email addresses only — guest bookings without one get a placeholder like 7065551234@guest.volt. */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/@(guest|walkin)\.volt$/i.test(email);
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    console.log("═".repeat(60));
    console.log("✉️  [EMAIL SIMULATED — add SMTP_* env vars to send for real]");
    console.log(`   TO:      ${msg.to}`);
    console.log(`   SUBJECT: ${msg.subject}`);
    console.log(`   BODY:    ${msg.text.slice(0, 300)}`);
    console.log("═".repeat(60));
    return { success: true, simulated: true };
  }
  try {
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? undefined,
      replyTo: msg.replyTo ?? undefined,
    });
    return { success: true, id: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`❌ Email failed to ${msg.to}:`, error);
    return { success: false, error };
  }
}

// ── HTML layout ───────────────────────────────────────────────────────────────
// Plain, email-client-safe markup (tables + inline styles).

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailBusiness {
  street: string;
  cityLine: string;
  phone: string;
  email: string;
}

const DEFAULT_BUSINESS: EmailBusiness = {
  street: "3885 Miller Road, Suite C", cityLine: "Columbus, GA 31909", phone: "(706) 530-5896", email: SUPPORT_EMAIL_DEFAULT,
};

/** Wrap plain text (paragraphs split on blank lines) in Volt's email layout. */
export function emailHtml(
  title: string, text: string, button?: { label: string; url: string }, business: EmailBusiness = DEFAULT_BUSINESS,
): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta = button
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(button.url)}" style="background:#FCC300;color:#0A0A0A;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0A0A0A;padding:18px 24px;color:#FCC300;font-size:18px;font-weight:700">⚡ Volt Transportation</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${paragraphs}${cta}
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;color:#71717a;font-size:12px;line-height:1.5">
Volt Transportation · ${escapeHtml(business.street)}, ${escapeHtml(business.cityLine)} · ${escapeHtml(business.phone)}<br>
Questions? Reply to this email or write to ${escapeHtml(business.email)}.
</td></tr>
</table></td></tr></table></body></html>`;
}
