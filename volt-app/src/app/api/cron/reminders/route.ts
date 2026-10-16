import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminDb } from "@/lib/checkout";
import { isSmsConfigured } from "@/lib/notifications/sms";
import { enqueue, processQueue } from "@/lib/notifications/queue";
import { runAlertScans } from "@/lib/notifications/alerts";
import { enforceBlackouts } from "@/lib/blackouts";
import { reminderMessage } from "@/lib/reservation-messages";
import { loadAppSettings } from "@/lib/settings-server";

// POST /api/cron/reminders — the background worker. Called every 10 minutes by
// Supabase pg_cron (migration 019) with "Authorization: Bearer <CRON_SECRET>".
//   1. Queues the 24-hour and 2-hour trip reminder texts that are due (see
//      due_trip_reminders() in migration 018). Each reminder's `kind` is unique
//      per leg, so overlapping runs can't double-text. Without a real SMS
//      provider reminders are left alone, so they aren't used up while texts
//      are only being simulated.
//   2. Retries queued texts/emails that failed earlier (src/lib/notifications/queue.ts).
//   3. Runs the staff-alert scans (src/lib/notifications/alerts.ts).
//   4. Applies active blackouts to newly generated departures.
//   5. Records a heartbeat (system_status 'worker') for Settings → Message Health.

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 16) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createAdminDb();
  const reminders = await queueReminders(sb);
  const queue = await processQueue(sb);
  const alerts = await runAlertScans(sb);
  const blackouts = await enforceBlackouts(sb).catch((err) => {
    console.error("[cron] blackouts", err);
    return "error";
  });

  const result = { reminders, queue, alerts, blackouts };
  await sb.from("system_status").upsert({ key: "worker", value: result, updated_at: new Date().toISOString() });
  return NextResponse.json(result);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queueReminders(sb: any): Promise<Record<string, number | string>> {
  if (!isSmsConfigured()) return { skipped: "SMS provider not configured" };

  const { data: due, error } = await sb.rpc("due_trip_reminders");
  if (error) {
    console.error("[cron/reminders]", error);
    return { error: error.message };
  }

  // Which reminder is which: kind 'reminder_24h:' = the first reminder,
  // 'reminder_2h:' = the second (names kept from before timing was editable).
  const { reminders } = await loadAppSettings();
  let sent = 0;
  let failed = 0;
  for (const r of due ?? []) {
    const first = String(r.kind).startsWith("reminder_24h");
    const message = (await reminderMessage(sb, first ? "first" : "second", {
      firstName: r.first_name,
      confirmationNumber: r.confirmation_number,
      date: r.departure_date,
      time: r.departure_time,
      from: r.origin_label,
      hoursBefore: first ? reminders.firstHours : reminders.secondHours,
    })).sms;
    const [res] = await enqueue(sb, [{
      channel: "sms", to: r.phone, text: message, reservationId: r.reservation_id, kind: r.kind,
    }]);
    if (res.duplicate) continue;
    if (res.sent) sent++;
    else failed++;
  }
  return { due: due?.length ?? 0, sent, failed };
}
