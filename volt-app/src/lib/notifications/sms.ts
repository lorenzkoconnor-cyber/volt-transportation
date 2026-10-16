// ─── Volt Transportation — SMS Notification Service ───────────────────────────
//
// Provider-abstracted SMS sending. The first configured provider wins:
//   1. RingCentral — Volt's office number. Replies land in the RingCentral app
//      (shared SMS inbox), not here.
//   2. Twilio      — legacy fallback.
//   3. Neither     — logs the message to the console (dev/staging mode) and
//                    reports `simulated: true`.
//
// RingCentral env vars (Developer Console → your app → Credentials):
//   RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET,
//   RINGCENTRAL_JWT          — JWT credential of the user who owns the number
//   RINGCENTRAL_FROM_NUMBER  — the Volt number texts come from, e.g. +17065550000
//   RINGCENTRAL_SERVER_URL   — optional, defaults to production
// ──────────────────────────────────────────────────────────────────────────────

export interface SMSResult {
  success: boolean;
  sid?: string;        // provider message id when sent
  error?: string;
  simulated?: boolean; // true when no provider is configured
}

const set = (v: string | undefined) => !!v && v.length > 8 && !v.includes("placeholder") && !v.includes("your-");

function isRingCentralConfigured(): boolean {
  const from = process.env.RINGCENTRAL_FROM_NUMBER ?? "";
  return (
    set(process.env.RINGCENTRAL_CLIENT_ID) &&
    set(process.env.RINGCENTRAL_CLIENT_SECRET) &&
    set(process.env.RINGCENTRAL_JWT) &&
    from.startsWith("+1") && from.length >= 12
  );
}

function isTwilioConfigured(): boolean {
  const sid   = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const from  = process.env.TWILIO_PHONE_NUMBER ?? "";
  return (
    sid.startsWith("AC") &&
    sid.length > 10 &&
    token.length > 10 &&
    from.startsWith("+1") &&
    from.length >= 12 &&
    !sid.includes("placeholder") &&
    !token.includes("placeholder")
  );
}

/** Which provider texts go through right now. */
export function smsProvider(): "RingCentral" | "Twilio" | null {
  return isRingCentralConfigured() ? "RingCentral" : isTwilioConfigured() ? "Twilio" : null;
}

/** True when texts would really be sent (not just logged). */
export function isSmsConfigured(): boolean {
  return isRingCentralConfigured() || isTwilioConfigured();
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
}

export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  const e164 = toE164(to);

  if (isRingCentralConfigured()) return sendViaRingCentral(e164, message);
  if (isTwilioConfigured()) return sendViaTwilio(e164, message);

  // ── Dev / staging mode: log and return simulated success ────────────────────
  console.log("═".repeat(60));
  console.log("📱 [SMS SIMULATED — add RingCentral keys to send for real]");
  console.log(`   TO:      ${e164}`);
  console.log(`   MESSAGE: ${message}`);
  console.log("═".repeat(60));
  return { success: true, simulated: true };
}

// ── RingCentral ───────────────────────────────────────────────────────────────
// JWT auth → short-lived access token (cached until a minute before expiry).
let rcToken: { value: string; expiresAt: number } | null = null;

function rcServer(): string {
  return (process.env.RINGCENTRAL_SERVER_URL || "https://platform.ringcentral.com").replace(/\/$/, "");
}

async function ringCentralToken(): Promise<string> {
  if (rcToken && rcToken.expiresAt > Date.now()) return rcToken.value;
  const basic = Buffer.from(
    `${process.env.RINGCENTRAL_CLIENT_ID}:${process.env.RINGCENTRAL_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(`${rcServer()}/restapi/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: process.env.RINGCENTRAL_JWT!,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`RingCentral sign-in failed: ${data.error_description ?? data.message ?? res.status}`);
  }
  rcToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000 };
  return rcToken.value;
}

async function sendViaRingCentral(e164: string, message: string): Promise<SMSResult> {
  try {
    const send = async () =>
      fetch(`${rcServer()}/restapi/v1.0/account/~/extension/~/sms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await ringCentralToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { phoneNumber: process.env.RINGCENTRAL_FROM_NUMBER },
          to: [{ phoneNumber: e164 }],
          text: message,
        }),
      });
    let res = await send();
    if (res.status === 401) {   // token revoked early — sign in again once
      rcToken = null;
      res = await send();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? `RingCentral error ${res.status}`);
    console.log(`✅ SMS sent to ${e164} via RingCentral — id ${data.id}`);
    return { success: true, sid: data.id ? String(data.id) : undefined };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`❌ SMS failed to ${e164}:`, error);
    return { success: false, error };
  }
}

// ── Twilio ────────────────────────────────────────────────────────────────────
async function sendViaTwilio(e164: string, message: string): Promise<SMSResult> {
  try {
    // Dynamic import so the app doesn't crash if twilio isn't installed
    const twilio = await import("twilio");
    const client = twilio.default(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const msg = await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER!, to: e164 });
    console.log(`✅ SMS sent to ${e164} — SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`❌ SMS failed to ${e164}:`, error);
    return { success: false, error };
  }
}

// ─── Pre-built message templates ─────────────────────────────────────────────

export const SMS_TEMPLATES = {
  bookingConfirmation: (params: {
    confirmationNumber: string;
    date: string;
    time: string;
    from: string;
    to: string;
    passengerName: string;
    returnLine?: string;   // "Return: Fri, Oct 24 at 6:00 PM"
    receiptUrl?: string;
  }) =>
    `Volt Transportation: Hi ${params.passengerName}! Your ride is confirmed.\n\n` +
    `Confirmation: ${params.confirmationNumber}\n` +
    `${params.from} → ${params.to}\n` +
    `${params.date} at ${params.time}\n` +
    (params.returnLine ? `${params.returnLine}\n` : "") +
    (params.receiptUrl ? `\nReceipt: ${params.receiptUrl}\n` : "") +
    `\nArrive 20 min early. Reply STOP to opt out.`,

  tripReminder: (params: {
    confirmationNumber: string;
    time: string;
    from: string;
    passengerName: string;
  }) =>
    `Volt Transportation: Reminder — your ride departs TOMORROW at ${params.time} from ${params.from}.\n\n` +
    `Confirmation: ${params.confirmationNumber}\n` +
    `Please arrive 20 minutes early. See you soon!`,

  tripReminder2h: (params: {
    confirmationNumber: string;
    time: string;
    from: string;
    passengerName: string;
  }) =>
    `Volt Transportation: Hi ${params.passengerName}, your ride departs in about 2 hours — ${params.time} from ${params.from}.\n\n` +
    `Confirmation: ${params.confirmationNumber}\n` +
    `Please arrive 20 minutes early.`,

  cancellationConfirmed: (params: {
    confirmationNumber: string;
    refundAmount: number;
  }) =>
    `Volt Transportation: Your reservation ${params.confirmationNumber} has been cancelled.\n\n` +
    `Refund of $${params.refundAmount} will appear in 5–10 business days.\n` +
    `Book again anytime at volt-transportation.com`,

  reservationUpdated: (params: {
    confirmationNumber: string;
    change: string;
    receiptUrl?: string;
  }) =>
    `Volt Transportation: Your reservation ${params.confirmationNumber} has been updated.\n\n` +
    `${params.change}\n` +
    (params.receiptUrl ? `\nUpdated receipt: ${params.receiptUrl}\n` : "") +
    `\nQuestions? Reply to this text or call us.`,

  receiptLink: (params: { confirmationNumber: string; receiptUrl: string; passengerName: string }) =>
    `Volt Transportation: Hi ${params.passengerName}, here is your receipt for ${params.confirmationNumber}:\n` +
    `${params.receiptUrl}`,
} as const;
