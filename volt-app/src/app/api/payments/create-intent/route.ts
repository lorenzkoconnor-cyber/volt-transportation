import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import {
  codeTerms, createAdminDb, findCustomer, lookupDiscountCode, normalizePayload, priceCheckout,
  reserveDiscountCode, FREE_PAYMENT_ID, type DiscountCodeRow,
} from "@/lib/checkout";
import { CODE_ERRORS } from "@/lib/discount-codes";

// POST /api/payments/create-intent
// Called when the rider clicks Pay. Body: the booking details from Step 4
// (trips, passenger counts, passengers, flights) + militaryDiscountRequested
// + optional discountCode (replaces the Military Discount when present).
//
// The amount is computed HERE from the booking details — anything price-like
// sent by the browser is ignored. Creates a booking_checkouts row and exactly
// one PaymentIntent for it (idempotency key = checkout id), then returns the
// clientSecret for the Payment Element.
//
// Returns: { checkoutId, clientSecret, paymentIntentId, amountCents, captureMethod, simulated, free }
// A code that covers the whole fare returns free: true and no PaymentIntent.
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

    let code: DiscountCodeRow | null = null;
    if (body.discountCode) {
      const found = await lookupDiscountCode(sb, String(body.discountCode));
      if (!found.ok) return NextResponse.json({ error: found.error, codeError: true }, { status: 400 });
      code = found.row;
    }

    const price = priceCheckout(
      payload,
      !code && !!body.militaryDiscountRequested,
      customer?.military_status ?? null,
      code ? codeTerms(code) : null,
    );
    if ("error" in price) {
      return NextResponse.json({ error: price.error }, { status: 400 });
    }
    if (price.totalCents !== 0 && price.totalCents < 50) {
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
        discount_code_id: code?.id ?? null,
      })
      .select("id")
      .single();
    if (checkoutError || !checkout) throw checkoutError ?? new Error("Could not start checkout");

    if (code && !(await reserveDiscountCode(sb, code.id, checkout.id))) {
      await sb.from("booking_checkouts").update({ status: "failed", error: CODE_ERRORS.busy }).eq("id", checkout.id);
      return NextResponse.json({ error: CODE_ERRORS.busy, codeError: true }, { status: 409 });
    }

    const response = {
      checkoutId: checkout.id,
      amountCents: price.totalCents,
      captureMethod: price.captureMethod,
    };

    // ── Free booking: the code covers the whole fare — no card needed ───────
    if (price.totalCents === 0) {
      return NextResponse.json({
        ...response, clientSecret: "", paymentIntentId: FREE_PAYMENT_ID, simulated: false, free: true,
      });
    }

    // ── Simulated mode (no Stripe keys) ──────────────────────────────────────
    const stripe = getStripeServer();
    if (!stripe) {
      const fakeId = `pi_simulated_${Date.now()}`;
      await sb.from("booking_checkouts").update({ stripe_payment_intent_id: fakeId }).eq("id", checkout.id);
      return NextResponse.json({ ...response, clientSecret: `${fakeId}_secret_simulated`, paymentIntentId: fakeId, simulated: true, free: false });
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
          military_discount: price.militaryDiscountPending ? "pending_verification" : price.isMilitary ? "applied" : "none",
          discount_code: code?.code ?? "",
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
      free: false,
    });
  } catch (err) {
    console.error("[create-intent]", err);
    return NextResponse.json({ error: "Payment initialization failed. Please try again." }, { status: 500 });
  }
}
