import { NextRequest, NextResponse } from "next/server";
import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// POST /api/notifications/send-sms
// Body: { type, reservationId, ...templateParams }
// Called internally from booking/create and webhook handlers (not publicly exposed)

export async function POST(request: NextRequest) {
  // Verify internal secret to prevent abuse (this would otherwise be an open
  // SMS relay on our Twilio bill). No secret configured → endpoint is off.
  const secret = process.env.INTERNAL_API_SECRET;
  const authHeader = request.headers.get("x-internal-secret") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(authHeader, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, to, reservationId, ...params } = body;

    if (!to || !type) {
      return NextResponse.json({ error: "Missing required fields: to, type" }, { status: 400 });
    }

    // Build message from template
    let message: string;
    switch (type) {
      case "booking_confirmation":
        message = SMS_TEMPLATES.bookingConfirmation(params);
        break;
      case "trip_reminder":
        message = SMS_TEMPLATES.tripReminder(params);
        break;
      case "cancellation_confirmed":
        message = SMS_TEMPLATES.cancellationConfirmed(params);
        break;
      case "reservation_updated":
        message = SMS_TEMPLATES.reservationUpdated(params);
        break;
      default:
        // Custom raw message
        message = params.message;
        if (!message) return NextResponse.json({ error: "Unknown type and no message provided" }, { status: 400 });
    }

    const result = await sendSMS(to, message);

    // Log to notifications table if reservationId provided
    if (reservationId && result.success) {
      const supabase = createSupabaseClient(
        getSupabaseUrl(),
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      await supabase.from("notifications").insert({
        reservation_id: reservationId,
        type: "sms",
        recipient: to,
        message,
        status: result.success ? "sent" : "failed",
        provider_id: result.sid ?? null,
      });
    }

    return NextResponse.json({
      success: result.success,
      simulated: result.simulated ?? false,
      sid: result.sid,
    });
  } catch (err) {
    console.error("[send-sms]", err);
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
  }
}
