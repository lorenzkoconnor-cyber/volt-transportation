import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";

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
    if (!tripId || !customerId || !primaryPassenger || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Generate confirmation number
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let confirmationNumber = "VOLT-";
    for (let i = 0; i < 6; i++) {
      confirmationNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 1. Create reservation
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .insert({
        confirmation_number: confirmationNumber,
        customer_id: customerId,
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

    if (resError || !reservation) throw resError;

    // 2. Create passenger manifest entries
    const passengerInserts = [
      { reservation_id: reservation.id, name: primaryPassenger.name, is_primary: true },
      ...additionalPassengers
        .filter((n: string) => n.trim())
        .map((name: string) => ({ reservation_id: reservation.id, name, is_primary: false })),
    ];

    await supabase.from("reservation_passengers").insert(passengerInserts);

    // 3. Update trip seats_booked
    const totalPassengers = adults + children;
    await supabase.rpc("increment_seats_booked", {
      p_trip_id: tripId,
      p_count: totalPassengers,
    });

    if (isRoundTrip && returnTripId) {
      await supabase.rpc("increment_seats_booked", {
        p_trip_id: returnTripId,
        p_count: totalPassengers,
      });
    }

    // 4. Record payment
    await supabase.from("payments").insert({
      reservation_id: reservation.id,
      method: "stripe",
      status: "paid",
      amount_cents: totalCents,
      stripe_payment_intent_id: stripePaymentIntentId,
      refund_amount_cents: 0,
    });

    // 5. Queue SMS notification (handled by Supabase Edge Function or Twilio)
    await supabase.from("notifications").insert({
      reservation_id: reservation.id,
      type: "sms",
      recipient: primaryPassenger.phone,
      message: `Volt Transportation: Your booking is confirmed! Confirmation: ${confirmationNumber}. We'll see you soon.`,
      status: "pending",
    });

    // 6. Audit log
    await supabase.from("audit_logs").insert({
      actor_id: customerId,
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
