import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminDb } from "@/lib/checkout";
import { isSmsConfigured, sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { formatTime12h } from "@/lib/format";

// POST /api/cron/reminders — called every 10 minutes by Supabase pg_cron
// (migration 019) with "Authorization: Bearer <CRON_SECRET>".
// Sends the 24-hour and 2-hour trip reminders that are due (see
// due_trip_reminders() in migration 018). Each reminder is claimed in
// `notifications` before sending, so overlapping runs can't double-text.
// Without a real SMS provider it does nothing, so reminders aren't marked
// "sent" while texts are only being simulated.

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
  if (!isSmsConfigured()) return NextResponse.json({ skipped: "SMS provider not configured" });

  const sb = createAdminDb();
  const { data: due, error } = await sb.rpc("due_trip_reminders");
  if (error) {
    console.error("[cron/reminders]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const r of due ?? []) {
    const is24 = String(r.kind).startsWith("reminder_24h");
    const params = {
      confirmationNumber: r.confirmation_number,
      time: formatTime12h(r.departure_time),
      from: r.origin_label,
      passengerName: r.first_name,
    };
    const message = is24 ? SMS_TEMPLATES.tripReminder(params) : SMS_TEMPLATES.tripReminder2h(params);

    // Claim first — the unique index rejects a second claim for this leg.
    const { data: claim, error: claimError } = await sb
      .from("notifications")
      .insert({ reservation_id: r.reservation_id, type: "sms", recipient: r.phone, message, status: "pending", kind: r.kind })
      .select("id")
      .single();
    if (claimError || !claim) continue;

    const result = await sendSMS(r.phone, message);
    await sb.from("notifications")
      .update({ status: result.success ? "sent" : "failed", provider_id: result.sid ?? null, sent_at: new Date().toISOString() })
      .eq("id", claim.id);
    if (result.success) sent++;
    else failed++;
  }

  return NextResponse.json({ due: due?.length ?? 0, sent, failed });
}
