// ─── Card holds (authorize now, capture later) ─────────────────────────────────
// Military Discount bookings made while the rider's ID is under review are
// authorized for the full fare. The Verifications queue then settles them:
//   • approved        → capture 90% (the rest of the hold is released)
//   • denied          → capture 100%
//   • can't verify    → capture 100%; if approved later, the 10% is refunded
// A hold on a cancelled booking is released (voided) without charging.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripeServer } from "@/lib/stripe/server";
import { isSimulatedPaymentId } from "@/lib/checkout";
import { MILITARY_DISCOUNT_RATE } from "@/lib/booking";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface HoldPayment {
  id: string;
  method: string;
  status: string;
  amount_cents: number;
  refund_amount_cents: number;
  stripe_payment_intent_id: string | null;
}

function isRealStripe(p: HoldPayment): boolean {
  const pi = p.stripe_payment_intent_id;
  return p.method === "stripe" && !!pi && pi.startsWith("pi_") && !isSimulatedPaymentId(pi);
}

export type HoldOutcome =
  | { ok: true }
  | { ok: false; expired: boolean; error: string };

// Capture `amountCents` (≤ the authorized amount) of an authorized payment.
export async function captureHold(
  sb: Db,
  payment: HoldPayment,
  amountCents: number,
  employeeId: string | null,
  note: string,
): Promise<HoldOutcome> {
  if (payment.status !== "authorized") return { ok: false, expired: false, error: "Payment is not on hold." };
  if (amountCents <= 0 || amountCents > payment.amount_cents) {
    return { ok: false, expired: false, error: "Capture amount exceeds the authorized amount." };
  }

  let chargeId: string | null = null;
  if (isRealStripe(payment)) {
    const stripe = getStripeServer();
    if (!stripe) return { ok: false, expired: false, error: "Stripe keys are not configured." };
    try {
      const pi = await stripe.paymentIntents.capture(
        payment.stripe_payment_intent_id!,
        { amount_to_capture: amountCents },
        { idempotencyKey: `volt-capture-${payment.id}-${amountCents}` },
      );
      chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
    } catch (err) {
      // Most commonly: the 7-day authorization already expired.
      const stripe2 = getStripeServer()!;
      const pi = await stripe2.paymentIntents.retrieve(payment.stripe_payment_intent_id!).catch(() => null);
      if (pi?.status === "canceled") {
        await markVoided(sb, payment.id, "Card hold expired before it was captured — collect payment from the rider.");
        return { ok: false, expired: true, error: "The card hold expired." };
      }
      if (pi?.status === "succeeded") {
        // Already captured (e.g. a retried request) — just sync our record.
        chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
        amountCents = pi.amount_received;
      } else {
        console.error("[holds] capture failed", err);
        return { ok: false, expired: false, error: err instanceof Error ? err.message : "Capture failed." };
      }
    }
  }

  const update: Record<string, unknown> = {
    status: "paid",
    amount_cents: amountCents,
    captured_at: new Date().toISOString(),
    captured_by_employee_id: employeeId,
    notes: note,
  };
  if (chargeId) update.stripe_charge_id = chargeId;
  // Only move forward from 'authorized' — the webhook may have synced it already.
  await sb.from("payments").update(update).eq("id", payment.id).eq("status", "authorized");
  return { ok: true };
}

// Release a hold without charging (booking cancelled).
export async function voidHold(sb: Db, payment: HoldPayment, note: string): Promise<HoldOutcome> {
  if (payment.status !== "authorized") return { ok: false, expired: false, error: "Payment is not on hold." };
  if (isRealStripe(payment)) {
    const stripe = getStripeServer();
    if (!stripe) return { ok: false, expired: false, error: "Stripe keys are not configured." };
    try {
      await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id!, { cancellation_reason: "requested_by_customer" });
    } catch (err) {
      const pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id!).catch(() => null);
      if (pi?.status !== "canceled") {
        console.error("[holds] void failed", err);
        return { ok: false, expired: false, error: err instanceof Error ? err.message : "Could not release the hold." };
      }
    }
  }
  await markVoided(sb, payment.id, note);
  return { ok: true };
}

export async function markVoided(sb: Db, paymentId: string, note: string) {
  await sb.from("payments").update({ status: "voided", notes: note }).eq("id", paymentId).eq("status", "authorized");
}

// Refund part of an already-captured card payment (e.g. the 10% for a rider
// approved after being charged full price).
export async function refundPart(
  sb: Db,
  payment: HoldPayment,
  amountCents: number,
  employeeId: string | null,
): Promise<HoldOutcome> {
  if (isRealStripe(payment)) {
    const stripe = getStripeServer();
    if (!stripe) return { ok: false, expired: false, error: "Stripe keys are not configured." };
    try {
      await stripe.refunds.create(
        { payment_intent: payment.stripe_payment_intent_id!, amount: amountCents, metadata: { reason: "military_discount" } },
        { idempotencyKey: `volt-military-refund-${payment.id}` },
      );
    } catch (err) {
      console.error("[holds] refund failed", err);
      return { ok: false, expired: false, error: err instanceof Error ? err.message : "Refund failed." };
    }
  }
  await sb.from("payments").update({
    refund_amount_cents: (payment.refund_amount_cents ?? 0) + amountCents,
    refunded_at: new Date().toISOString(),
    refunded_by_employee_id: employeeId,
  }).eq("id", payment.id);
  return { ok: true };
}

// ── Verification decisions ─────────────────────────────────────────────────────
export type MilitaryDecision = "approve" | "reject" | "unverifiable";

// Settle every booking a rider made while their verification was pending
// (or just `reservationId`). The customer's own status is updated by the caller.
export async function settleMilitaryBookings(
  sb: Db,
  customerId: string,
  decision: MilitaryDecision,
  employeeId: string | null,
  reservationId?: string,
) {
  let query = sb
    .from("reservations")
    .select("id, status, subtotal_cents, payments(id, method, status, amount_cents, refund_amount_cents, stripe_payment_intent_id, created_at)")
    .eq("customer_id", customerId)
    .eq("military_discount_pending", true);
  if (reservationId) query = query.eq("id", reservationId);
  const { data: bookings } = await query;

  const summary = {
    captured: 0,        // holds captured
    capturedCents: 0,
    refunded: 0,        // already-charged bookings refunded 10%
    refundedCents: 0,
    released: 0,        // holds released on cancelled bookings
    failed: [] as string[],
  };

  for (const r of bookings ?? []) {
    const payments = (r.payments ?? []) as (HoldPayment & { created_at: string })[];
    const payment = payments.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    const discountCents = Math.round(r.subtotal_cents * MILITARY_DISCOUNT_RATE);

    // Cancelled booking: never charge it — just let go of any hold.
    if (r.status === "cancelled") {
      if (payment?.status === "authorized") {
        const res = await voidHold(sb, payment, "Hold released — booking was cancelled.");
        if (res.ok) summary.released += 1; else summary.failed.push(res.error);
      }
      await sb.from("reservations").update({ military_discount_pending: false }).eq("id", r.id);
      continue;
    }

    if (decision === "approve") {
      let settled = true;
      if (payment?.status === "authorized") {
        const amount = payment.amount_cents - discountCents;
        const res = await captureHold(sb, payment, amount, employeeId,
          `Military Discount approved — captured ${100 - Math.round(MILITARY_DISCOUNT_RATE * 100)}% of the hold.`);
        if (res.ok) { summary.captured += 1; summary.capturedCents += amount; }
        else { settled = false; summary.failed.push(res.error); }
      } else if (payment?.status === "paid") {
        const res = await refundPart(sb, payment, discountCents, employeeId);
        if (res.ok) { summary.refunded += 1; summary.refundedCents += discountCents; }
        else { settled = false; summary.failed.push(res.error); }
      } else if (payment && payment.method === "stripe") {
        // Voided / failed card payment — nothing to adjust on the card.
        settled = false;
        summary.failed.push("A booking has no active card payment (hold expired) — collect payment from the rider.");
      }
      if (settled) {
        await sb.from("reservations").update({
          discount_cents: discountCents,
          total_cents: r.subtotal_cents - discountCents,
          military_discount_pending: false,
        }).eq("id", r.id);
      }
      continue;
    }

    // reject / unverifiable → charge the full fare.
    if (payment?.status === "authorized") {
      const res = await captureHold(sb, payment, payment.amount_cents, employeeId,
        decision === "reject"
          ? "Military Discount denied — captured the full fare."
          : "Military Discount could not be verified — captured the full fare; refund 10% if approved later.");
      if (res.ok) { summary.captured += 1; summary.capturedCents += payment.amount_cents; }
      else { summary.failed.push(res.error); continue; }
    }
    if (decision === "reject") {
      await sb.from("reservations")
        .update({ military_discount_pending: false, is_military: false })
        .eq("id", r.id);
    }
    // unverifiable: the booking stays flagged so a later approval refunds the 10%.
  }

  return summary;
}
