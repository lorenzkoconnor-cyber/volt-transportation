// ─── Checkout: pricing + finalization (server-only) ─────────────────────────────
// The single place a paid booking turns into a reservation.
//
//   1. /api/payments/create-intent → priceCheckout() computes the total from the
//      booking details (never trusting the browser), stores a booking_checkouts
//      row, and creates ONE PaymentIntent for it.
//   2. The browser confirms the payment with Stripe.
//   3. finalizeCheckout() verifies the PaymentIntent with Stripe and creates the
//      reservation. It runs from BOTH the browser (/api/booking/create) and the
//      Stripe webhook, whichever arrives first — so a rider closing the page
//      after paying still gets their booking. It is idempotent: a checkout can
//      only ever produce one reservation.
//
// Military Discount riders awaiting verification are AUTHORIZED for the full
// fare (capture_method = manual) and captured later from the Verifications
// queue — see src/lib/stripe/holds.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { getStripeServer } from "@/lib/stripe/server";
import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { formatTime12h, formatDateLong } from "@/lib/format";
import { MILITARY_DISCOUNT_RATE, PRICING, generateConfirmationNumber } from "@/lib/booking";
import {
  CODE_ERRORS, codeDiscountCents, codeLabel, codeState, formatCode, normalizeCode,
  type DiscountCodeTerms,
} from "@/lib/discount-codes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function createAdminDb(): Db {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function isSimulatedPaymentId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("pi_simulated");
}

// Uncaptured card authorizations expire after 7 days (Stripe default).
export const AUTHORIZATION_DAYS = 7;

// ── Booking details sent from Step 4 ──────────────────────────────────────────
export interface CheckoutPayload {
  tripId: string;
  returnTripId: string | null;
  isRoundTrip: boolean;
  adults: number;
  children: number;
  pets: number;
  extraBags: number;
  primaryPassenger: { name: string; phone: string; email: string };
  additionalPassengers: string[];
  specialNotes: string;
  flights: unknown[];
}

const count = (v: unknown, min: number) => Math.max(min, Math.min(20, Math.floor(Number(v) || 0)));
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function normalizePayload(body: Record<string, unknown>): CheckoutPayload | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (body.primaryPassenger ?? {}) as any;
  const payload: CheckoutPayload = {
    tripId: text(body.tripId, 64),
    returnTripId: body.returnTripId ? text(body.returnTripId, 64) : null,
    isRoundTrip: !!body.isRoundTrip && !!body.returnTripId,
    adults: count(body.adults, 1),
    children: count(body.children, 0),
    pets: count(body.pets, 0),
    extraBags: count(body.extraBags, 0),
    primaryPassenger: { name: text(p.name, 120), phone: text(p.phone, 30), email: text(p.email, 200).toLowerCase() },
    additionalPassengers: (Array.isArray(body.additionalPassengers) ? body.additionalPassengers : [])
      .map((n) => text(n, 120))
      .filter(Boolean)
      .slice(0, 20),
    specialNotes: text(body.specialNotes, 1000),
    flights: Array.isArray(body.flights) ? body.flights.slice(0, 2) : [],
  };
  if (!payload.tripId || !payload.primaryPassenger.name || !payload.primaryPassenger.phone) return null;
  return payload;
}

// Customer lookup WITHOUT creating anything (checkout may never be paid).
// Signed-in riders always resolve to their own account; guests match by
// email + phone, mirroring /api/military/upload.
export async function findCustomer(
  sb: Db,
  sessionUserId: string | null,
  payload: CheckoutPayload,
): Promise<{ id: string; military_status: string } | null> {
  if (sessionUserId) {
    const { data } = await sb
      .from("customers")
      .select("id, military_status")
      .eq("user_id", sessionUserId)
      .maybeSingle();
    if (data) return data;
  }
  const { email, phone } = payload.primaryPassenger;
  if (!email) return null;
  const { data } = await sb
    .from("customers")
    .select("id, military_status")
    .eq("email", email)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export interface CheckoutPrice {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  captureMethod: "automatic" | "manual";
  isMilitary: boolean;
  militaryDiscountPending: boolean;
}

// Price is computed HERE from the passenger counts (same PRICING table the
// site shows) and either a discount code or the customer's verification status:
//   • discount code                → code's discount, charged immediately (it
//                                    replaces the Military Discount; may be free)
//   • approved account            → 10% off now, charged immediately
//   • verification pending         → full fare AUTHORIZED only; captured at 90%
//                                    on approval or 100% on denial
//   • discount not requested       → full fare, charged immediately
export function priceCheckout(
  payload: CheckoutPayload,
  militaryRequested: boolean,
  militaryStatus: string | null,
  code: DiscountCodeTerms | null = null,
): CheckoutPrice | { error: string } {
  const oneWayDollars =
    payload.adults * PRICING.adult + payload.children * PRICING.child +
    payload.pets * PRICING.pet + payload.extraBags * PRICING.extraBag;
  const subtotalCents = oneWayDollars * (payload.isRoundTrip ? 2 : 1) * 100;
  const full: CheckoutPrice = {
    subtotalCents, discountCents: 0, totalCents: subtotalCents,
    captureMethod: "automatic", isMilitary: false, militaryDiscountPending: false,
  };

  if (code) {
    const discountCents = codeDiscountCents(subtotalCents, code);
    return { ...full, discountCents, totalCents: subtotalCents - discountCents };
  }
  if (!militaryRequested) return full;
  if (militaryStatus === "approved") {
    const discountCents = Math.round(subtotalCents * MILITARY_DISCOUNT_RATE);
    return { ...full, discountCents, totalCents: subtotalCents - discountCents, isMilitary: true };
  }
  if (militaryStatus === "pending") {
    return { ...full, captureMethod: "manual", isMilitary: true, militaryDiscountPending: true };
  }
  return { error: "Please upload your military ID to request the discount, or untick the box to continue at full price." };
}

// ── Discount codes ────────────────────────────────────────────────────────────
export interface DiscountCodeRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  value: number;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  reserved_checkout_id: string | null;
  reserved_until: string | null;
}

export function codeTerms(row: DiscountCodeRow): DiscountCodeTerms {
  return { type: row.discount_type, value: row.value };
}

// Find a code a rider typed and check it can still be spent.
export async function lookupDiscountCode(
  sb: Db,
  input: string,
): Promise<{ ok: true; row: DiscountCodeRow } | { ok: false; error: string }> {
  const code = normalizeCode(input);
  if (!code) return { ok: false, error: CODE_ERRORS.invalid };
  const { data: row } = await sb.from("discount_codes").select("*").eq("code", code).maybeSingle();
  if (!row) return { ok: false, error: CODE_ERRORS.invalid };
  const state = codeState(row);
  if (state !== "active") return { ok: false, error: CODE_ERRORS[state] };
  return { ok: true, row };
}

// Hold the code for this checkout while the rider pays (30 min), so it can't
// be spent twice at once. Returns false if another live checkout holds it.
export async function reserveDiscountCode(sb: Db, codeId: string, checkoutId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await sb
    .from("discount_codes")
    .update({ reserved_checkout_id: checkoutId, reserved_until: new Date(Date.now() + 30 * 60_000).toISOString() })
    .eq("id", codeId)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .or(`reserved_until.is.null,reserved_until.lt.${now}`)
    .select("id");
  return !!data && data.length > 0;
}

export function describeCode(row: Pick<DiscountCodeRow, "code" | "discount_type" | "value">): string {
  return `${formatCode(row.code)} (${codeLabel({ type: row.discount_type, value: row.value })})`;
}

// Sentinel "payment id" for bookings a discount code made free.
export const FREE_PAYMENT_ID = "free";

// ── Payment verification ──────────────────────────────────────────────────────
type Verified =
  | { ok: true; pi: Stripe.PaymentIntent | null; chargeId: string | null; captureBefore: string | null }
  | { ok: false; status: number; error: string; release?: boolean; notYet?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyPayment(stripe: Stripe | null, checkout: any, paymentIntentId: string): Promise<Verified> {
  // Free booking (discount code covered the whole fare) — nothing to verify,
  // but ONLY when the server itself priced this checkout at $0.
  if (checkout.total_cents === 0 || paymentIntentId === FREE_PAYMENT_ID) {
    return checkout.total_cents === 0 && paymentIntentId === FREE_PAYMENT_ID
      ? { ok: true, pi: null, chargeId: null, captureBefore: null }
      : { ok: false, status: 400, error: "Invalid payment reference." };
  }
  if (!stripe) {
    // Simulated mode (no Stripe keys) — only simulated ids are accepted.
    return isSimulatedPaymentId(paymentIntentId)
      ? { ok: true, pi: null, chargeId: null, captureBefore: null }
      : { ok: false, status: 400, error: "Invalid payment reference." };
  }
  if (!paymentIntentId.startsWith("pi_") || isSimulatedPaymentId(paymentIntentId) ||
      paymentIntentId !== checkout.stripe_payment_intent_id) {
    return { ok: false, status: 400, error: "Invalid payment reference." };
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  } catch {
    return { ok: false, status: 400, error: "Payment could not be verified." };
  }

  const expected = checkout.capture_method === "manual" ? ["requires_capture", "succeeded"] : ["succeeded"];
  if (!expected.includes(pi.status)) {
    return pi.status === "processing"
      ? { ok: false, status: 202, error: "Payment is still processing.", notYet: true }
      : { ok: false, status: 402, error: "Payment has not completed." };
  }
  if (pi.metadata?.checkout_id !== checkout.id || pi.amount !== checkout.total_cents || pi.currency !== "usd") {
    console.error(`[checkout] PaymentIntent ${pi.id} does not match checkout ${checkout.id} (amount ${pi.amount}, expected ${checkout.total_cents})`);
    return {
      ok: false, status: 400, release: true,
      error: "The payment didn't match the booking price, so it has been refunded. Please try again.",
    };
  }

  const charge = pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
  const captureBeforeUnix = charge?.payment_method_details?.card?.capture_before;
  const captureBefore = pi.status === "requires_capture"
    ? new Date(captureBeforeUnix ? captureBeforeUnix * 1000 : Date.now() + AUTHORIZATION_DAYS * 86_400_000).toISOString()
    : null;
  return { ok: true, pi, chargeId: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null), captureBefore };
}

// Give the money back on a PaymentIntent we can't honour: release a hold, or
// refund a completed charge. Best-effort; logged on failure.
export async function releasePayment(paymentIntentId: string, reason: string): Promise<void> {
  const stripe = getStripeServer();
  if (!stripe || !paymentIntentId.startsWith("pi_") || isSimulatedPaymentId(paymentIntentId)) return;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "succeeded") {
      await stripe.refunds.create({ payment_intent: pi.id, metadata: { reason } });
    } else if (pi.status !== "canceled") {
      await stripe.paymentIntents.cancel(pi.id);
    }
  } catch (err) {
    console.error(`[checkout] could not release ${paymentIntentId}`, err);
  }
}

// ── Finalization ──────────────────────────────────────────────────────────────
export type FinalizeResult =
  | {
      ok: true;
      confirmationNumber: string;
      reservationId: string;
      military: { applied: boolean; pending: boolean };
    }
  | { ok: false; status: number; error: string; processing?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function completedResult(c: any): FinalizeResult {
  return {
    ok: true,
    confirmationNumber: c.confirmation_number,
    reservationId: c.reservation_id,
    military: { applied: c.discount_cents > 0 && !c.discount_code_id, pending: !!c.military_discount_pending },
  };
}

// A claim older than this is assumed to have crashed and can be retried.
const STALE_CLAIM_MS = 2 * 60 * 1000;

export async function finalizeCheckout(
  checkoutId: string,
  paymentIntentId: string,
  source: "client" | "webhook",
): Promise<FinalizeResult> {
  const sb = createAdminDb();
  const stripe = getStripeServer();

  const { data: checkout } = await sb.from("booking_checkouts").select("*").eq("id", checkoutId).maybeSingle();
  if (!checkout) return { ok: false, status: 404, error: "Checkout not found." };
  if (checkout.status === "completed") return completedResult(checkout);
  if (checkout.status === "failed") return { ok: false, status: 409, error: checkout.error ?? "This checkout could not be completed." };

  const verified = await verifyPayment(stripe, checkout, paymentIntentId);
  if (!verified.ok) {
    if (verified.notYet) return { ok: false, status: 202, error: verified.error, processing: true };
    if (verified.release) {
      await releasePayment(paymentIntentId, "amount_mismatch");
      await sb.from("booking_checkouts").update({ status: "failed", error: verified.error }).eq("id", checkoutId);
    }
    return { ok: false, status: verified.status, error: verified.error };
  }

  // Claim the checkout so the browser and the webhook can't both create a
  // reservation. Whoever loses the race reports "processing".
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed } = await sb
    .from("booking_checkouts")
    .update({ status: "processing" })
    .eq("id", checkoutId)
    .or(`status.eq.open,and(status.eq.processing,updated_at.lt.${staleBefore})`)
    .select("id");
  if (!claimed || claimed.length === 0) {
    const { data: again } = await sb.from("booking_checkouts").select("*").eq("id", checkoutId).single();
    if (again?.status === "completed") return completedResult(again);
    return { ok: false, status: 202, error: "Your booking is being confirmed…", processing: true };
  }

  const payload = checkout.payload as CheckoutPayload;
  const seats = payload.adults + payload.children;
  const free = checkout.total_cents === 0;

  // Spend the discount code (once, ever). A retry of this same checkout may
  // re-claim it. If someone else spent it first, a free booking is refused;
  // a paid one is honoured (the rider already paid the quoted price) and logged.
  let codeRow: DiscountCodeRow | null = null;
  if (checkout.discount_code_id) {
    const { data: spent } = await sb
      .from("discount_codes")
      .update({ used_at: new Date().toISOString(), used_checkout_id: checkoutId })
      .eq("id", checkout.discount_code_id)
      .or(`used_at.is.null,used_checkout_id.eq.${checkoutId}`)
      .select("*");
    codeRow = spent?.[0] ?? null;
    if (!codeRow) {
      if (free) {
        const error = CODE_ERRORS.used;
        await sb.from("booking_checkouts").update({ status: "failed", error }).eq("id", checkoutId);
        return { ok: false, status: 409, error };
      }
      console.error(`[checkout] discount code on checkout ${checkoutId} was already spent elsewhere — honouring paid booking`);
      const { data: row } = await sb.from("discount_codes").select("*").eq("id", checkout.discount_code_id).maybeSingle();
      codeRow = row ?? null;
    }
  }
  let outboundHeld = false;
  let returnHeld = false;
  let reservationId: string | null = null;

  try {
    // 1. Customer — find or create now that the booking is actually paid.
    let customerId: string | null = checkout.customer_id;
    if (!customerId) {
      const found = await findCustomer(sb, null, payload);
      if (found) {
        customerId = found.id;
      } else {
        const nameParts = payload.primaryPassenger.name.split(/\s+/);
        const email = payload.primaryPassenger.email ||
          `${payload.primaryPassenger.phone.replace(/\D/g, "")}@guest.volt`;
        const { data: created, error } = await sb
          .from("customers")
          .insert({
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(" ") || "—",
            email,
            phone: payload.primaryPassenger.phone,
            is_military: false,
          })
          .select("id")
          .single();
        if (error || !created) throw error ?? new Error("Could not create customer");
        customerId = created.id;
      }
    }

    // 2. Seats — atomically fails if the trip filled up since checkout began.
    const { error: seatError } = await sb.rpc("increment_seats_booked", { p_trip_id: payload.tripId, p_count: seats });
    if (seatError) return await failSoldOut(sb, checkoutId, paymentIntentId, checkout.discount_code_id, "Sorry — that departure just sold out. Your payment has been released. Please pick another time.");
    outboundHeld = true;
    if (payload.isRoundTrip && payload.returnTripId) {
      const { error: returnSeatError } = await sb.rpc("increment_seats_booked", { p_trip_id: payload.returnTripId, p_count: seats });
      if (returnSeatError) {
        await sb.rpc("decrement_seats_booked", { p_trip_id: payload.tripId, p_count: seats });
        outboundHeld = false;
        return await failSoldOut(sb, checkoutId, paymentIntentId, checkout.discount_code_id, "Sorry — that return departure just sold out. Your payment has been released. Please pick another time.");
      }
      returnHeld = true;
    }

    // 3. Reservation
    const confirmationNumber = generateConfirmationNumber();

    const { data: reservation, error: resError } = await sb
      .from("reservations")
      .insert({
        confirmation_number: confirmationNumber,
        customer_id: customerId,
        trip_id: payload.tripId,
        return_trip_id: payload.returnTripId || null,
        status: "confirmed",
        adults: payload.adults,
        children: payload.children,
        pets: payload.pets,
        extra_bags: payload.extraBags,
        is_round_trip: payload.isRoundTrip,
        special_notes: payload.specialNotes || null,
        subtotal_cents: checkout.subtotal_cents,
        discount_cents: checkout.discount_cents,
        total_cents: checkout.total_cents,
        is_military: checkout.is_military,
        military_discount_pending: checkout.military_discount_pending,
        discount_code_id: checkout.discount_code_id ?? null,
      })
      .select()
      .single();
    if (resError || !reservation) throw resError ?? new Error("Reservation insert failed");
    reservationId = reservation.id;

    // 4. Payment record — linked to the reservation AND the PaymentIntent.
    const authorized = verified.pi?.status === "requires_capture";
    const codeNote = codeRow ? `Discount code ${describeCode(codeRow)}.` : null;
    const { error: payError } = await sb.from("payments").insert({
      reservation_id: reservation.id,
      method: free ? "comp" : "stripe",
      status: authorized ? "authorized" : "paid",
      amount_cents: checkout.total_cents,
      stripe_payment_intent_id: free ? null : paymentIntentId,
      stripe_charge_id: verified.chargeId,
      refund_amount_cents: 0,
      authorization_expires_at: verified.captureBefore,
      captured_at: authorized ? null : new Date().toISOString(),
      notes: authorized
        ? "Card authorized for the full fare — Military Discount verification pending."
        : free ? `Free booking — ${codeNote}` : codeNote,
    });
    if (payError) throw payError;

    // 5. Passengers + flight details (malformed flight rows are dropped rather
    //    than failing a paid booking).
    await sb.from("reservation_passengers").insert([
      { reservation_id: reservation.id, name: payload.primaryPassenger.name, is_primary: true },
      ...payload.additionalPassengers.map((name) => ({ reservation_id: reservation.id, name, is_primary: false })),
    ]);

    const flightRows = payload.flights
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => {
        const tripForLeg = f?.leg === "outbound" ? payload.tripId : f?.leg === "return" ? payload.returnTripId : null;
        const row = {
          reservation_id: reservation.id,
          trip_id: tripForLeg,
          leg: f?.leg,
          direction: f?.direction === "arriving" ? "arriving" : "departing",
          airline: text(f?.airline, 60),
          flight_number: text(f?.flightNumber, 10).toUpperCase(),
          terminal: text(f?.terminal, 60),
          flight_date: text(f?.date, 10),
          flight_time: text(f?.time, 5),
        };
        const valid =
          tripForLeg && f?.tripId === tripForLeg &&
          row.airline && row.flight_number && row.terminal &&
          /^\d{4}-\d{2}-\d{2}$/.test(row.flight_date) && /^\d{2}:\d{2}$/.test(row.flight_time);
        return valid ? row : null;
      })
      .filter(Boolean);
    if (flightRows.length > 0) {
      const { error: flightError } = await sb.from("reservation_flights").insert(flightRows);
      if (flightError) console.error("[checkout] flight details not saved", flightError);
    }

    // 6. Close the checkout.
    const done = {
      status: "completed",
      customer_id: customerId,
      reservation_id: reservation.id,
      confirmation_number: confirmationNumber,
      error: null,
    };
    await sb.from("booking_checkouts").update(done).eq("id", checkoutId);
    if (codeRow) {
      await sb.from("discount_codes").update({ used_reservation_id: reservation.id }).eq("id", codeRow.id);
    }

    // ── Everything below is best-effort: the booking is already confirmed. ──

    // Tag the PaymentIntent with the reservation so it's findable in Stripe.
    if (stripe && verified.pi) {
      stripe.paymentIntents
        .update(paymentIntentId, {
          metadata: { reservation_id: reservation.id, confirmation_number: confirmationNumber },
          description: `Volt Transportation — ${confirmationNumber}`,
        })
        .catch((err) => console.error("[checkout] PaymentIntent metadata update failed", err));
    }

    await sendConfirmationSms(sb, reservation.id, payload, confirmationNumber);

    await sb.from("audit_logs").insert({
      actor_id: customerId,
      actor_role: "customer",
      action: "reservation.created",
      table_name: "reservations",
      record_id: reservation.id,
      new_data: {
        confirmation_number: confirmationNumber,
        total_cents: checkout.total_cents,
        payment: authorized ? "authorized" : "paid",
        is_military: checkout.is_military,
        military_discount_pending: checkout.military_discount_pending,
        discount_code: codeRow ? formatCode(codeRow.code) : null,
        confirmed_by: source,
      },
    });

    return completedResult({ ...checkout, ...done });
  } catch (err) {
    // Undo partial work and reopen the checkout so a webhook retry can redo it.
    if (reservationId) {
      await sb.from("reservation_passengers").delete().eq("reservation_id", reservationId);
      await sb.from("reservation_flights").delete().eq("reservation_id", reservationId);
      await sb.from("reservations").delete().eq("id", reservationId);
    }
    if (outboundHeld) await sb.rpc("decrement_seats_booked", { p_trip_id: payload.tripId, p_count: seats });
    if (returnHeld) await sb.rpc("decrement_seats_booked", { p_trip_id: payload.returnTripId, p_count: seats });
    await sb.from("booking_checkouts").update({ status: "open", error: String((err as Error)?.message ?? err) }).eq("id", checkoutId);
    throw err;
  }
}

async function failSoldOut(
  sb: Db, checkoutId: string, paymentIntentId: string, discountCodeId: string | null, error: string,
): Promise<FinalizeResult> {
  await releasePayment(paymentIntentId, "sold_out");
  // No booking was made, so the rider keeps their (unexpired) code.
  if (discountCodeId) {
    await sb.from("discount_codes")
      .update({ used_at: null, used_checkout_id: null })
      .eq("id", discountCodeId)
      .eq("used_checkout_id", checkoutId)
      .is("used_reservation_id", null);
  }
  await sb.from("booking_checkouts").update({ status: "failed", error }).eq("id", checkoutId);
  return { ok: false, status: 409, error };
}

async function sendConfirmationSms(sb: Db, reservationId: string, payload: CheckoutPayload, confirmationNumber: string) {
  try {
    const { data: tripInfo } = await sb
      .from("trips")
      .select("departure_date, departure_time, route:routes(origin_label, destination_label)")
      .eq("id", payload.tripId)
      .single();

    const message = SMS_TEMPLATES.bookingConfirmation({
      confirmationNumber,
      date: tripInfo ? formatDateLong(tripInfo.departure_date) : "",
      time: tripInfo ? formatTime12h(tripInfo.departure_time) : "",
      from: tripInfo?.route?.origin_label ?? "",
      to: tripInfo?.route?.destination_label ?? "",
      passengerName: payload.primaryPassenger.name.split(" ")[0],
    });

    let status: "sent" | "failed" = "failed";
    try {
      status = (await sendSMS(payload.primaryPassenger.phone, message)).success ? "sent" : "failed";
    } catch { /* recorded as failed */ }

    await sb.from("notifications").insert({
      reservation_id: reservationId,
      type: "sms",
      recipient: payload.primaryPassenger.phone,
      message,
      status,
    });
  } catch (err) {
    console.error("[checkout] confirmation SMS step failed", err);
  }
}
