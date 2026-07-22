import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { formatTime12h, formatDateLong } from "@/lib/format";

// Use raw supabase client to avoid TS inference issues during Supabase setup phase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAdminClient(): any {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/booking/create
// Called after Stripe payment succeeds (from webhook or client confirmation)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tripId,
      returnTripId,
      customerId,
      adults,
      children,
      pets,
      extraBags,
      isRoundTrip,
      primaryPassenger,    // { name, phone, email }
      additionalPassengers, // string[]
      specialNotes,
      subtotalCents,
      totalCents,
      stripePaymentIntentId,
    } = body;

    // Validate required fields
    if (!tripId || !primaryPassenger?.name || !primaryPassenger?.phone || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 0. Resolve the customer: use an existing id when the caller is signed in,
    //    otherwise find-or-create a record from the primary passenger's details.
    let resolvedCustomerId: string | null =
      customerId && customerId !== "guest" ? customerId : null;

    if (!resolvedCustomerId) {
      const nameParts = String(primaryPassenger.name).trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "—";
      const email = primaryPassenger.email?.trim() || `${String(primaryPassenger.phone).replace(/\D/g, "")}@guest.volt`;

      // Reuse an existing guest record with the same email + phone
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("email", email)
        .eq("phone", primaryPassenger.phone)
        .limit(1)
        .maybeSingle();

      if (existing) {
        resolvedCustomerId = existing.id;
      } else {
        const { data: created, error: custError } = await supabase
          .from("customers")
          .insert({
            first_name: firstName,
            last_name: lastName,
            email,
            phone: primaryPassenger.phone,
            is_military: false,
          })
          .select()
          .single();
        if (custError || !created) throw custError;
        resolvedCustomerId = created.id;
      }
    }

    // 1. Reserve the seats FIRST — this atomically fails if the trip is full,
    //    so we never create a reservation we can't seat.
    const totalPassengers = (adults ?? 1) + (children ?? 0);
    const { error: seatError } = await supabase.rpc("increment_seats_booked", {
      p_trip_id: tripId,
      p_count: totalPassengers,
    });
    if (seatError) {
      return NextResponse.json(
        { error: "Sorry — that departure just sold out. Please pick another time." },
        { status: 409 }
      );
    }

    if (isRoundTrip && returnTripId) {
      const { error: returnSeatError } = await supabase.rpc("increment_seats_booked", {
        p_trip_id: returnTripId,
        p_count: totalPassengers,
      });
      if (returnSeatError) {
        // Roll back the outbound seats
        await supabase.rpc("decrement_seats_booked", { p_trip_id: tripId, p_count: totalPassengers });
        return NextResponse.json(
          { error: "Sorry — that return departure just sold out. Please pick another time." },
          { status: 409 }
        );
      }
    }

    // Generate confirmation number
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let confirmationNumber = "VOLT-";
    for (let i = 0; i < 6; i++) {
      confirmationNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 2. Create reservation
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .insert({
        confirmation_number: confirmationNumber,
        customer_id: resolvedCustomerId,
        trip_id: tripId,
        return_trip_id: returnTripId || null,
        status: "confirmed",
        adults,
        children,
        pets,
        extra_bags: extraBags,
        is_round_trip: isRoundTrip,
        special_notes: specialNotes || null,
        subtotal_cents: subtotalCents,
        discount_cents: 0,
        total_cents: totalCents,
      })
      .select()
      .single();

    if (resError || !reservation) {
      // Roll back the reserved seats
      await supabase.rpc("decrement_seats_booked", { p_trip_id: tripId, p_count: totalPassengers });
      if (isRoundTrip && returnTripId) {
        await supabase.rpc("decrement_seats_booked", { p_trip_id: returnTripId, p_count: totalPassengers });
      }
      throw resError;
    }

    // 3. Create passenger manifest entries
    const passengerInserts = [
      { reservation_id: reservation.id, name: primaryPassenger.name, is_primary: true },
      ...(additionalPassengers ?? [])
        .filter((n: string) => n.trim())
        .map((name: string) => ({ reservation_id: reservation.id, name, is_primary: false })),
    ];

    await supabase.from("reservation_passengers").insert(passengerInserts);

    // 4. Record payment
    await supabase.from("payments").insert({
      reservation_id: reservation.id,
      method: "stripe",
      status: "paid",
      amount_cents: totalCents,
      stripe_payment_intent_id: stripePaymentIntentId,
      refund_amount_cents: 0,
    });

    // 5. Send booking-confirmation SMS (safely no-ops without Twilio keys) and
    //    record the outcome. Fetch trip details so the message is complete.
    const { data: tripInfo } = await supabase
      .from("trips")
      .select("departure_date, departure_time, route:routes(origin_label, destination_label)")
      .eq("id", tripId)
      .single();

    const smsMessage = SMS_TEMPLATES.bookingConfirmation({
      confirmationNumber,
      date: tripInfo ? formatDateLong(tripInfo.departure_date) : "",
      time: tripInfo ? formatTime12h(tripInfo.departure_time) : "",
      from: tripInfo?.route?.origin_label ?? "",
      to: tripInfo?.route?.destination_label ?? "",
      passengerName: String(primaryPassenger.name).split(" ")[0],
    });

    let smsStatus: "sent" | "failed" | "pending" = "pending";
    try {
      const smsResult = await sendSMS(primaryPassenger.phone, smsMessage);
      smsStatus = smsResult.success ? "sent" : "failed";
    } catch {
      smsStatus = "failed";
    }

    await supabase.from("notifications").insert({
      reservation_id: reservation.id,
      type: "sms",
      recipient: primaryPassenger.phone,
      message: smsMessage,
      status: smsStatus,
    });

    // 6. Audit log
    await supabase.from("audit_logs").insert({
      actor_id: resolvedCustomerId,
      actor_role: "customer",
      action: "reservation.created",
      table_name: "reservations",
      record_id: reservation.id,
      new_data: { confirmation_number: confirmationNumber, total_cents: totalCents },
    });

    return NextResponse.json({
      success: true,
      confirmationNumber,
      reservationId: reservation.id,
    });
  } catch (err) {
    console.error("[booking/create]", err);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}
