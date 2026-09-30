import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import { createAdminDb, findCustomer, normalizePayload, priceCheckout } from "@/lib/checkout";

// POST /api/payments/create-intent
// Called when the rider clicks Pay. Body: the booking details from Step 4
// (trips, passenger counts, passengers, flights) + militaryDiscountRequested.
//
// The amount is computed HERE from the booking details — anything price-like
// sent by the browser is ignored. Creates a booking_checkouts row and exactly
// one PaymentIntent for it (idempotency key = checkout id), then returns the
// clientSecret for the Payment Element.
//
// Returns: { checkoutId, clientSecret, paymentIntentId, amountCents, captureMethod, simulated }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = normalizePayload(body);
    if (!payload) {
      return NextResponse.json({ error: "Missing booking details." }, { status: 400 });
    }

    const sb = createAdminDb();

    // Trips must exist, be bookable, and (softly) have room. Seats are taken
    // atomically only once payment succeeds.
    const tripIds = [payload.tripId, ...(payload.isRoundTrip && payload.returnTripId ? [payload.returnTripId] : [])];
    const { data: trips } = await sb
      .from("trips")
      .select("id, status, total_capacity, seats_booked, departure_date, departure_time, route:routes(origin_label, destination_label)")
      .in("id", tripIds);
    const seats = payload.adults + payload.children;
    for (const id of tripIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (trips ?? []).find((x: any) => x.id === id);
      if (!t || t.status !== "scheduled") {
        return NextResponse.json({ error: "That departure is no longer available. Please pick another time." }, { status: 409 });
      }
      if (t.total_capacity - t.seats_booked < seats) {
        return NextResponse.json({ error: "Sorry — that departure doesn't have enough seats left. Please pick another time." }, { status: 409 });
      }
    }

    // Who is booking — the signed-in account, or a guest matched by email + phone.
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    const customer = await findCustomer(sb, user?.id ?? null, payload);

    const price = priceCheckout(payload, !!body.militaryDiscountRequested, customer?.military_status ?? null);
    if ("error" in price) {
      return NextResponse.json({ error: price.error }, { status: 400 });
    }
    if (price.totalCents < 50) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const { data: checkout, error: checkoutError } = await sb
      .from("booking_checkouts")
      .insert({
        customer_id: customer?.id ?? null,
        payload,
        subtotal_cents: price.subtotalCents,
        discount_cents: price.discountCents,
        total_cents: price.totalCents,
        capture_method: price.captureMethod,
        is_military: price.isMilitary,
        military_discount_pending: price.militaryDiscountPending,
      })
      .select("id")
      .single();
    if (checkoutError || !checkout) throw checkoutError ?? new Error("Could not start checkout");

    const response = {
      checkoutId: checkout.id,
      amountCents: price.totalCents,
      captureMethod: price.captureMethod,
    };

    // ── Simulated mode (no Stripe keys) ──────────────────────────────────────
    const stripe = getStripeServer();
    if (!stripe) {
      const fakeId = `pi_simulated_${Date.now()}`;
      await sb.from("booking_checkouts").update({ stripe_payment_intent_id: fakeId }).eq("id", checkout.id);
      return NextResponse.json({ ...response, clientSecret: `${fakeId}_secret_simulated`, paymentIntentId: fakeId, simulated: true });
    }

    // ── Real Stripe ──────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outbound = (trips ?? []).find((x: any) => x.id === payload.tripId);
    const routeLabel = outbound?.route
      ? `${outbound.route.origin_label} → ${outbound.route.destination_label}`
      : "Shuttle Booking";

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: price.totalCents,
        currency: "usd",
        capture_method: price.captureMethod,
        // Cards only (includes Apple Pay / Google Pay). Keeps the rider on the
        // page — no redirect-based methods that would drop the booking wizard.
        payment_method_types: ["card"],
        receipt_email: payload.primaryPassenger.email || undefined,
        description: `Volt Transportation — ${routeLabel}${payload.isRoundTrip ? " (round trip)" : ""}`,
        metadata: {
          platform: "volt_transportation",
          checkout_id: checkout.id,
          customer_id: customer?.id ?? "",
          customer_name: payload.primaryPassenger.name,
          customer_phone: payload.primaryPassenger.phone,
          trip_date: outbound?.departure_date ?? "",
          trip_time: outbound?.departure_time ?? "",
          military_discount: price.militaryDiscountPending ? "pending_verification" : price.discountCents > 0 ? "applied" : "none",
        },
      },
      { idempotencyKey: `volt-checkout-${checkout.id}` },
    );

    await sb
      .from("booking_checkouts")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", checkout.id);

    return NextResponse.json({
      ...response,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      simulated: false,
    });
  } catch (err) {
    console.error("[create-intent]", err);
    return NextResponse.json({ error: "Payment initialization failed. Please try again." }, { status: 500 });
  }
}
