// ─── Supabase Edge Function: send-reminder ────────────────────────────────────
// Runs daily at 6:00 PM (scheduled via Supabase Cron or pg_cron).
// Finds all reservations departing TOMORROW and sends reminder SMS.
//
// Deploy: supabase functions deploy send-reminder
// Schedule: supabase functions schedule send-reminder --cron "0 18 * * *"
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VOLT_APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://volttransportation.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_API_SECRET") ?? "";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Find tomorrow's confirmed reservations that haven't received a reminder yet
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const { data: reservations, error } = await supabase
    .from("reservation_details")
    .select("*")
    .eq("trip_date", tomorrowStr)
    .in("status", ["confirmed"]);

  if (error) {
    console.error("Failed to fetch reservations:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`📅 Sending reminders for ${reservations?.length ?? 0} reservations on ${tomorrowStr}`);

  let sent = 0;
  let failed = 0;

  for (const res of reservations ?? []) {
    // Check if reminder was already sent (avoid duplicates)
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("reservation_id", res.id)
      .eq("type", "sms")
      .like("message", "%Reminder%")
      .single();

    if (existing) {
      console.log(`⏭️  Reminder already sent for ${res.confirmation_number}`);
      continue;
    }

    const timeStr = new Date(`1970-01-01T${res.trip_time}`)
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    const response = await fetch(`${VOLT_APP_URL}/api/notifications/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        type: "trip_reminder",
        to: res.customer_phone,
        reservationId: res.id,
        confirmationNumber: res.confirmation_number,
        time: timeStr,
        from: res.origin_label,
        passengerName: res.customer_first_name,
      }),
    });

    if (response.ok) {
      sent++;
      console.log(`✅ Reminder sent: ${res.confirmation_number} → ${res.customer_phone}`);
    } else {
      failed++;
      console.error(`❌ Reminder failed: ${res.confirmation_number}`);
    }
  }

  return new Response(
    JSON.stringify({ success: true, sent, failed, date: tomorrowStr }),
    { headers: { "Content-Type": "application/json" } }
  );
});
