// ─── Outbound message queue (server-only) ─────────────────────────────────────
// Every text and email Volt sends goes through here:
//
//   1. enqueue() writes a `notifications` row (status 'pending') and tries to
//      send it right away.
//   2. If that fails, the row stays pending and the cron worker
//      (/api/cron/reminders, every 10 min) retries it via processQueue() with
//      backoff, up to MAX_ATTEMPTS.
//   3. A customer/support message that finally fails raises the
//      "message_failed" staff alert, so somebody follows up by hand.
//
// A row is "claimed" by pushing next_attempt_at into the future with a
// conditional update, so the immediate send and the cron worker can never both
// deliver the same message. If the server dies mid-send, the claim lapses and
// the worker picks it up.
// ─────────────────────────────────────────────────────────────────────────────

import { isSmsConfigured, sendSMS } from "@/lib/notifications/sms";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Channel = "sms" | "email";
export type Audience = "customer" | "staff" | "support";

export interface QueueItem {
  channel: Channel;
  to: string;
  text: string;
  subject?: string | null;     // email only
  html?: string | null;        // email only
  replyTo?: string | null;     // email only
  reservationId?: string | null;
  kind?: string | null;        // what it is: 'confirmation', 'reminder_24h:<trip>', 'alert:<type>', …
  audience?: Audience;
  dedupeKey?: string | null;   // a second enqueue with the same key is ignored
}

export interface DeliveryResult {
  id: string | null;
  sent: boolean;
  simulated: boolean;
  duplicate?: boolean;
  error?: string;
}

export const MAX_ATTEMPTS = 5;
const CLAIM_MS = 2 * 60_000;
// Wait before attempt n+1 (after n failures): 2 min, 10 min, 30 min, 2 h.
const BACKOFF_MS = [2, 10, 30, 120].map((m) => m * 60_000);

interface Row {
  id: string;
  type: Channel;
  recipient: string;
  message: string;
  subject: string | null;
  html: string | null;
  reply_to: string | null;
  audience: Audience;
  attempts: number;
  kind: string | null;
  reservation_id: string | null;
  next_attempt_at: string;
}

const ROW_COLUMNS =
  "id, type, recipient, message, subject, html, reply_to, audience, attempts, kind, reservation_id, next_attempt_at";

function providerReady(channel: Channel): boolean {
  return channel === "sms" ? isSmsConfigured() : isEmailConfigured();
}

/** Queue messages and try to send each one now. Never throws. */
export async function enqueue(sb: Db, items: QueueItem[]): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  for (const item of items) {
    if (!item.to) {
      results.push({ id: null, sent: false, simulated: false, error: "No recipient." });
      continue;
    }
    try {
      const { data: row, error } = await sb
        .from("notifications")
        .insert({
          type: item.channel,
          recipient: item.to,
          message: item.text,
          subject: item.subject ?? null,
          html: item.html ?? null,
          reply_to: item.replyTo ?? null,
          reservation_id: item.reservationId ?? null,
          kind: item.kind ?? null,
          audience: item.audience ?? "customer",
          dedupe_key: item.dedupeKey ?? null,
          status: "pending",
          // Claimed by this request from the start.
          next_attempt_at: new Date(Date.now() + CLAIM_MS).toISOString(),
        })
        .select(ROW_COLUMNS)
        .single();
      if (error) {
        // 23505 = unique violation: this exact message was already queued.
        if (error.code === "23505") {
          results.push({ id: null, sent: false, simulated: false, duplicate: true });
        } else {
          console.error("[queue] enqueue failed", error);
          results.push({ id: null, sent: false, simulated: false, error: "Could not queue the message." });
        }
        continue;
      }
      results.push(await deliver(sb, row as Row));
    } catch (err) {
      console.error("[queue] enqueue threw", err);
      results.push({ id: null, sent: false, simulated: false, error: "Could not queue the message." });
    }
  }
  return results;
}

/** Retry pending messages whose time has come. Returns counts for the cron log. */
export async function processQueue(sb: Db, limit = 50): Promise<{ sent: number; failed: number; retrying: number }> {
  const counts = { sent: 0, failed: 0, retrying: 0 };
  const { data: due, error } = await sb
    .from("notifications")
    .select(ROW_COLUMNS)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) {
    console.error("[queue] could not load due messages", error);
    return counts;
  }
  for (const row of (due ?? []) as Row[]) {
    // Claim it — only succeeds if nobody else has touched it since we read it.
    const { data: claimed } = await sb
      .from("notifications")
      .update({ next_attempt_at: new Date(Date.now() + CLAIM_MS).toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("next_attempt_at", row.next_attempt_at)
      .select("id");
    if (!claimed?.length) continue;
    const r = await deliver(sb, row);
    if (r.sent) counts.sent++;
    else if (r.error && r.error.startsWith("Gave up")) counts.failed++;
    else counts.retrying++;
  }
  return counts;
}

async function deliver(sb: Db, row: Row): Promise<DeliveryResult> {
  // No provider set up yet: don't pretend it was sent, and don't retry — a
  // confirmation texted days later would only confuse the rider.
  if (!providerReady(row.type)) {
    const what = row.type === "sms" ? "Texting" : "Email";
    const note = `${what} isn't set up yet — message not sent.`;
    if (row.type === "sms") await sendSMS(row.recipient, row.message); // logs it (simulated)
    else await sendEmail({ to: row.recipient, subject: row.subject ?? "", text: row.message }); // logs it
    await sb.from("notifications")
      .update({ status: "failed", last_error: note, attempts: row.attempts + 1, sent_at: new Date().toISOString() })
      .eq("id", row.id);
    return { id: row.id, sent: false, simulated: true, error: note };
  }

  const result = row.type === "sms"
    ? await sendSMS(row.recipient, row.message).then((r) => ({ success: r.success, id: r.sid, error: r.error }))
    : await sendEmail({
        to: row.recipient,
        subject: row.subject ?? "Volt Transportation",
        text: row.message,
        html: row.html,
        replyTo: row.reply_to,
      });

  const attempts = row.attempts + 1;
  if (result.success) {
    await sb.from("notifications")
      .update({ status: "sent", provider_id: result.id ?? null, attempts, last_error: null, sent_at: new Date().toISOString() })
      .eq("id", row.id);
    return { id: row.id, sent: true, simulated: false };
  }

  const error = result.error ?? "Unknown error";
  if (attempts >= MAX_ATTEMPTS) {
    await sb.from("notifications")
      .update({ status: "failed", attempts, last_error: error, sent_at: new Date().toISOString() })
      .eq("id", row.id);
    if (row.audience !== "staff") await alertMessageFailed(sb, row, error);
    return { id: row.id, sent: false, simulated: false, error: `Gave up after ${attempts} tries: ${error}` };
  }

  await sb.from("notifications")
    .update({
      attempts,
      last_error: error,
      next_attempt_at: new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]).toISOString(),
    })
    .eq("id", row.id);
  return { id: row.id, sent: false, simulated: false, error: `${error} (will retry)` };
}

// Imported lazily: alerts.ts enqueues through this module.
async function alertMessageFailed(sb: Db, row: Row, error: string) {
  try {
    const { raiseStaffAlert } = await import("@/lib/notifications/alerts");
    const what = row.type === "sms" ? "text" : "email";
    let ref = "";
    if (row.reservation_id) {
      const { data } = await sb.from("reservations").select("confirmation_number").eq("id", row.reservation_id).maybeSingle();
      if (data?.confirmation_number) ref = ` for ${data.confirmation_number}`;
    }
    await raiseStaffAlert(sb, "message_failed", {
      key: `notification:${row.id}`,
      subject: `A ${what} to a customer failed${ref}`,
      text:
        `A ${what}${ref} to ${row.recipient} could not be delivered after ${MAX_ATTEMPTS} tries.\n` +
        `Error: ${error}\n\n` +
        `Please reach the customer another way.\n\nMessage:\n${row.message.slice(0, 400)}`,
    });
  } catch (err) {
    console.error("[queue] could not raise message_failed alert", err);
  }
}
