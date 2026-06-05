// ─── Volt Transportation — SMS Notification Service ───────────────────────────
//
// Provider-abstracted SMS sending.
// Behavior:
//   • Real Twilio credentials → sends actual SMS
//   • Placeholder / missing credentials → logs to console (dev/staging mode)
//
// To activate Twilio: fill in .env.local with real values. No code changes needed.
// ──────────────────────────────────────────────────────────────────────────────

export interface SMSResult {
  success: boolean;
  sid?: string;       // Twilio message SID when sent
  error?: string;
  simulated?: boolean; // true when credentials are placeholders
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

export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  // Sanitize phone number
  const phone = to.replace(/\D/g, "");
  const e164  = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;

  if (!isTwilioConfigured()) {
    // ── Dev / staging mode: log and return simulated success ──────────────────
    console.log("═".repeat(60));
    console.log("📱 [SMS SIMULATED — Add real Twilio keys to send for real]");
    console.log(`   TO:      ${e164}`);
    console.log(`   FROM:    ${process.env.TWILIO_PHONE_NUMBER}`);
    console.log(`   MESSAGE: ${message}`);
    console.log("═".repeat(60));
    return { success: true, simulated: true };
  }

  // ── Real Twilio send ─────────────────────────────────────────────────────────
  try {
    // Dynamic import so the app doesn't crash if twilio isn't installed
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: e164,
    });

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
  }) =>
    `Volt Transportation: Hi ${params.passengerName}! Your ride is confirmed.\n\n` +
    `Confirmation: ${params.confirmationNumber}\n` +
    `${params.from} → ${params.to}\n` +
    `${params.date} at ${params.time}\n\n` +
    `Arrive 10 min early. Reply STOP to opt out.`,

  tripReminder: (params: {
    confirmationNumber: string;
    time: string;
    from: string;
    passengerName: string;
  }) =>
    `Volt Transportation: Reminder — your ride departs TOMORROW at ${params.time} from ${params.from}.\n\n` +
    `Confirmation: ${params.confirmationNumber}\n` +
    `Please arrive 10 minutes early. See you soon!`,

  cancellationConfirmed: (params: {
    confirmationNumber: string;
    refundAmount: number;
  }) =>
    `Volt Transportation: Your reservation ${params.confirmationNumber} has been cancelled.\n\n` +
    `Refund of $${params.refundAmount} will appear in 5–10 business days.\n` +
    `Book again anytime at volttransportation.com`,

  reservationUpdated: (params: {
    confirmationNumber: string;
    change: string;
  }) =>
    `Volt Transportation: Your reservation ${params.confirmationNumber} has been updated.\n\n` +
    `Change: ${params.change}\n` +
    `Questions? Call us or visit volttransportation.com`,
} as const;
