import { NextRequest, NextResponse } from "next/server";
import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// POST /api/notifications/send-sms
// Body: { type, reservationId, ...templateParams }
// Called internally from booking/create and webhook handlers (not publicly exposed)

export async function POST(request: NextRequest) {
  // Verify internal secret to prevent abuse
  const authHeader = request.headers.get("x-internal-secret");
  if (authHeader !== process.env.INTERNAL_API_SECRET && process.env.NODE_ENV === "production") {
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
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
