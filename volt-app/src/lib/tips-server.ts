// ─── Tips after the trip (server-only) ────────────────────────────────────────
// /tip/<review_token> — linked from the review request email and the review
// thank-you screen. The rider picks an amount and pays by card; the tip is its
// own payments row (is_tip) and is added to the reservation's tip + total.
//
//   1. startTip()  → a PaymentIntent tagged { kind: "tip", reservation_id }.
//   2. The browser confirms it with Stripe.
//   3. recordTip() → verifies it with Stripe and records it. Runs from the
//      browser AND the Stripe webhook; the unique index on tip payment intents
//      means it's only ever recorded once.

import { createAdminDb, isSimulatedPaymentId } from "@/lib/checkout";
import { getStripeServer } from "@/lib/stripe/server";
import { LOCATIONS } from "@/lib/booking";
import { MIN_SEPARATE_TIP_CENTS, normalizeTipCents } from "@/lib/tips";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

async function reservationByToken(sb: Db, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await sb
    .from("reservations")
    .select("id, status, confirmation_number, tip_cents, is_round_trip, customer:customers(first_name, email), " +
      "trip:trips!reservations_trip_id_fkey(route:routes(origin_key, destination_key))")
    .eq("review_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  return data && data.status !== "cancelled" ? data : null;
}

export interface TipPage {
  firstName: string;
  tripLabel: string;
  confirmationNumber: string;
  alreadyTippedCents: number;
}

export async function loadTipPage(token: string): Promise<TipPage | null> {
  const r = await reservationByToken(createAdminDb(), token);
  if (!r) return null;
  const route = r.trip?.route;
  const from = LOCATIONS[route?.origin_key as keyof typeof LOCATIONS]?.short;
  const to = LOCATIONS[route?.destination_key as keyof typeof LOCATIONS]?.short;
  return {
    firstName: r.customer?.first_name ?? "",
    tripLabel: from && to ? (r.is_round_trip ? `${from} ⇄ ${to}` : `${from} → ${to}`) : "",
    confirmationNumber: r.confirmation_number,
    alreadyTippedCents: r.tip_cents ?? 0,
  };
}

export type StartTip =
  | { ok: true; clientSecret: string; paymentIntentId: string; simulated: boolean }
  | { ok: false; error: string; status?: number };

export async function startTip(token: string, rawCents: unknown): Promise<StartTip> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r) return { ok: false, error: "This tip link isn't valid.", status: 404 };
  const cents = normalizeTipCents(rawCents);
  if (cents < MIN_SEPARATE_TIP_CENTS) return { ok: false, error: "Tips start at $1." };

  const stripe = getStripeServer();
  if (!stripe) {
    return { ok: true, clientSecret: "", paymentIntentId: `pi_simulated_tip_${Date.now()}`, simulated: true };
  }
  const pi = await stripe.paymentIntents.create({
    amount: cents,
    currency: "usd",
    payment_method_types: ["card"],
    receipt_email: r.customer?.email && !/@(guest|walkin)\.volt$/.test(r.customer.email) ? r.customer.email : undefined,
    description: `Volt Transportation — tip (${r.confirmation_number})`,
    metadata: { platform: "volt_transportation", kind: "tip", reservation_id: r.id, confirmation_number: r.confirmation_number },
  });
  return { ok: true, clientSecret: pi.client_secret ?? "", paymentIntentId: pi.id, simulated: false };
}

export type RecordTip = { ok: true; amountCents: number } | { ok: false; error: string; status?: number };

/**
 * Record a paid tip. `simulated` (token + amount from the browser) is only
 * honoured when Stripe isn't configured — the local test mode.
 */
export async function recordTip(paymentIntentId: string, simulated?: { token: string; cents: unknown }): Promise<RecordTip> {
  const sb = createAdminDb();
  const stripe = getStripeServer();
  let reservationId: string;
  let amountCents: number;
  let chargeId: string | null = null;

  if (!stripe) {
    if (!isSimulatedPaymentId(paymentIntentId) || !simulated) return { ok: false, error: "Invalid payment reference.", status: 400 };
    const r = await reservationByToken(sb, simulated.token);
    if (!r) return { ok: false, error: "This tip link isn't valid.", status: 404 };
    reservationId = r.id;
    amountCents = normalizeTipCents(simulated.cents);
  } else {
    if (!paymentIntentId.startsWith("pi_") || isSimulatedPaymentId(paymentIntentId)) {
      return { ok: false, error: "Invalid payment reference.", status: 400 };
    }
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId).catch(() => null);
    if (!pi || pi.metadata?.kind !== "tip" || !pi.metadata.reservation_id) {
      return { ok: false, error: "Invalid payment reference.", status: 400 };
    }
    if (pi.status !== "succeeded") return { ok: false, error: "The payment hasn't gone through yet.", status: 402 };
    reservationId = pi.metadata.reservation_id;
    amountCents = pi.amount_received;
    chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  }
  if (amountCents <= 0) return { ok: false, error: "Nothing to record.", status: 400 };

  const { error } = await sb.from("payments").insert({
    reservation_id: reservationId,
    method: "stripe",
    status: "paid",
    is_tip: true,
    amount_cents: amountCents,
    refund_amount_cents: 0,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    captured_at: new Date().toISOString(),
    notes: "Tip after the trip",
  });
  if (error) {
    // Already recorded by the browser or the webhook.
    if (error.code === "23505") return { ok: true, amountCents };
    console.error("[tips] could not record tip", error);
    return { ok: false, error: "Your tip went through, but we couldn't save it. We'll sort it out — please don't pay again.", status: 500 };
  }
  await sb.rpc("add_reservation_tip", { p_reservation_id: reservationId, p_cents: amountCents });
  await sb.from("audit_logs").insert({
    actor_id: "guest",
    actor_role: "customer",
    action: "reservation.tip",
    table_name: "reservations",
    record_id: reservationId,
    new_data: { amount_cents: amountCents, payment_intent: paymentIntentId },
  });
  return { ok: true, amountCents };
}
