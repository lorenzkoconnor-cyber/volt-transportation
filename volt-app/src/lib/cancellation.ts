// ─── Cancelling a reservation (server-only) ───────────────────────────────────
// One path for every cancellation — the rider online (Manage Reservation) and
// staff (reservation page). It:
//   1. marks the reservation cancelled and frees its seats (exactly once);
//   2. keeps the cancellation fee (booking_settings.cancellation_fee_cents,
//      default $15 per reservation; owners/managers may waive it) and gives
//      the rest back automatically:
//        • card payments are refunded first, then cash;
//        • a card hold (Military Discount under review) is captured for just
//          the fee and the rest released — or released in full if no fee;
//        • cash can't be refunded online: a rider cancelling online is told to
//          collect it, and staff are alerted;
//   3. logs it, texts + emails the customer, and (online) alerts staff.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripeServer } from "@/lib/stripe/server";
import { cancelTerminalCheckout, getTerminalCheckout, isRealSquarePayment, refundSquarePayment } from "@/lib/square/server";
import { captureHold, voidHold } from "@/lib/stripe/holds";
import { isSimulatedPaymentId } from "@/lib/checkout";
import { formatCents } from "@/lib/format";
import { loadMessageInfo, notifyCancelled } from "@/lib/reservation-messages";
import { alertOnlineCancellation } from "@/lib/notifications/alerts";
import { planCancellation } from "@/lib/cancellation-plan";
import { loadAppSettings } from "@/lib/settings-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const DEFAULT_CANCELLATION_FEE_CENTS = 1500;
const WAIVE_ROLES = ["owner", "manager"];

export interface CancelBy {
  kind: "customer" | "staff";
  employee?: { id: string; role: string; name: string };
  userId?: string;
  waiveFee?: boolean;
  customerNote?: string;   // put before the refund details in the customer's message
}

export interface CancelResult {
  ok: boolean;
  error?: string;
  status?: number;
  feeCents: number;          // fee actually kept
  refundedCardCents: number; // refunded to cards (incl. released holds is NOT counted)
  cashRefundCents: number;   // cash handed back (staff) or still owed (online)
  cashOwedCents: number;     // cash the rider still has to collect (online only)
  holdReleased: boolean;
  lines: string[];           // human summary for staff
  customerLine: string;      // what the rider is told about the money
  problems: string[];        // anything that needs a person to follow up
}

export async function cancellationFeeCents(): Promise<number> {
  return (await loadAppSettings()).cancellationFeeCents;
}

function realCard(p: { method: string; stripe_payment_intent_id: string | null }): boolean {
  const pi = p.stripe_payment_intent_id;
  return p.method === "stripe" && !!pi && pi.startsWith("pi_") && !isSimulatedPaymentId(pi);
}

export async function cancelReservation(sb: Db, reservationId: string, by: CancelBy): Promise<CancelResult> {
  const empty: CancelResult = {
    ok: false, feeCents: 0, refundedCardCents: 0, cashRefundCents: 0, cashOwedCents: 0,
    holdReleased: false, lines: [], customerLine: "", problems: [],
  };
  if (by.waiveFee && !(by.kind === "staff" && by.employee && WAIVE_ROLES.includes(by.employee.role))) {
    return { ...empty, error: "Only an owner or manager can waive the cancellation fee.", status: 403 };
  }

  // 1. Cancel — only if it isn't already, so seats are freed exactly once.
  const { data: flipped, error: flipErr } = await sb
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_by_employee_id: by.employee?.id ?? null })
    .eq("id", reservationId)
    .neq("status", "cancelled")
    .select("id, confirmation_number, trip_id, return_trip_id, adults, children");
  if (flipErr) return { ...empty, error: flipErr.message, status: 500 };
  if (!flipped?.length) return { ...empty, error: "This reservation is already cancelled.", status: 400 };
  const r = flipped[0];
  const seats = (r.adults ?? 0) + (r.children ?? 0);
  await sb.rpc("decrement_seats_booked", { p_trip_id: r.trip_id, p_count: seats });
  if (r.return_trip_id) await sb.rpc("decrement_seats_booked", { p_trip_id: r.return_trip_id, p_count: seats });

  // 2. Money.
  const { data: payments } = await sb
    .from("payments")
    .select("id, method, status, amount_cents, refund_amount_cents, stripe_payment_intent_id, square_payment_id, square_checkout_id, created_at")
    .eq("reservation_id", reservationId);
  const all = payments ?? [];
  const stripe = getStripeServer();
  const out: CancelResult = { ...empty, ok: true };
  const now = () => new Date().toISOString();
  const staffId = by.employee?.id ?? null;

  const fee = by.waiveFee ? 0 : await cancellationFeeCents();

  // Unfinished payments (card never confirmed) are just voided.
  for (const p of all.filter((x: any) => x.status === "pending")) {
    if (realCard(p) && stripe) {
      await stripe.paymentIntents.cancel(p.stripe_payment_intent_id).catch(() => null);
    }
    // Stop a Square Terminal that's still showing this cart. If the customer
    // already tapped, the money is in — treat it as paid so it's refunded below.
    if (p.square_checkout_id) {
      const state = await cancelTerminalCheckout(p.square_checkout_id)
        .catch(() => getTerminalCheckout(p.square_checkout_id)).catch(() => null);
      if (state?.status === "COMPLETED") {
        await sb.from("payments").update({ status: "paid", captured_at: now(), square_payment_id: state.paymentId })
          .eq("id", p.id).eq("status", "pending");
        Object.assign(p, { status: "paid", square_payment_id: state.paymentId });
        continue;
      }
    }
    await sb.from("payments").update({ status: "voided", notes: "Reservation cancelled before payment." }).eq("id", p.id).eq("status", "pending");
  }

  const plan = planCancellation(all, fee, by.kind === "customer");
  const byId = new Map(all.map((p: any) => [p.id, p]));
  out.feeCents += plan.feeFromPaidCents;

  for (const r of plan.refunds) {
    const p: any = byId.get(r.paymentId);
    if (r.owedOnly) {
      // Can't hand cash back over the internet.
      out.cashOwedCents += r.amountCents;
      continue;
    }
    if (isRealSquarePayment(p)) {
      try {
        await refundSquarePayment(p.square_payment_id, r.amountCents, `Cancellation ${reservationId}`,
          `volt-cancel-refund-${p.id}-${p.refund_amount_cents}-${r.amountCents}`);
      } catch (err) {
        out.problems.push(`Square refund of ${formatCents(r.amountCents)} failed: ${err instanceof Error ? err.message : "unknown error"}. Refund it from Payments.`);
        continue;
      }
    }
    if (realCard(p)) {
      if (!stripe) {
        out.problems.push(`Card refund of ${formatCents(r.amountCents)} not sent — Stripe isn't configured.`);
        continue;
      }
      try {
        await stripe.refunds.create(
          { payment_intent: p.stripe_payment_intent_id, amount: r.amountCents, metadata: { reason: "cancellation", reservation_id: reservationId } },
          { idempotencyKey: `volt-cancel-refund-${p.id}-${p.refund_amount_cents}-${r.amountCents}` },
        );
      } catch (err) {
        out.problems.push(`Card refund of ${formatCents(r.amountCents)} failed: ${err instanceof Error ? err.message : "unknown error"}. Refund it from Payments.`);
        continue;
      }
    }
    const total = p.refund_amount_cents + r.amountCents;
    await sb.from("payments").update({
      refund_amount_cents: total,
      status: total >= p.amount_cents ? "refunded" : "paid",
      refunded_at: now(),
      refunded_by_employee_id: staffId,
    }).eq("id", p.id);
    if (p.method === "cash") {
      out.cashRefundCents += r.amountCents;
      out.lines.push(`${formatCents(r.amountCents)} cash to hand back`);
    } else {
      out.refundedCardCents += r.amountCents;
      out.lines.push(`${formatCents(r.amountCents)} refunded to the card`);
    }
  }

  // Card holds: capture just the remaining fee, release the rest.
  for (const h of plan.holds) {
    const p: any = byId.get(h.paymentId);
    if (h.action === "capture") {
      const res = await captureHold(sb, p, h.amountCents, staffId, "Cancellation fee — rest of the hold released.");
      if (res.ok) {
        out.feeCents += h.amountCents;
        out.holdReleased = true;
        out.lines.push(`${formatCents(h.amountCents)} cancellation fee charged; rest of the card hold released`);
        continue;
      }
      if (!res.expired) out.problems.push(`Could not charge the fee on the card hold: ${res.error}`);
      if (res.expired) continue; // already marked voided
    }
    const res = await voidHold(sb, p, "Hold released — reservation cancelled.");
    if (res.ok) {
      out.holdReleased = true;
      out.lines.push("Card hold released — nothing charged");
    } else {
      out.problems.push(`Could not release the card hold: ${res.error}`);
    }
  }
  if (out.holdReleased) await sb.from("reservations").update({ military_discount_pending: false }).eq("id", reservationId);

  if (out.feeCents > 0) out.lines.unshift(`${formatCents(out.feeCents)} cancellation fee kept`);
  else if (by.waiveFee) out.lines.unshift("Cancellation fee waived");
  if (out.cashOwedCents > 0) out.lines.push(`${formatCents(out.cashOwedCents)} cash still owed to the rider`);
  if (!out.lines.length) out.lines.push("Nothing was paid, so nothing to refund");
  out.lines.unshift(by.kind === "customer" ? "Cancelled online by the rider" : `Cancelled by ${by.employee?.name ?? "staff"}`);

  out.customerLine = customerMoneyLine(out);

  // 3. Record + tell people.
  await sb.from("reservation_changes").insert({
    reservation_id: reservationId,
    employee_id: staffId,
    employee_name: by.kind === "customer" ? "Rider (online)" : by.employee?.name ?? "Staff",
    action: "cancelled",
    summary: [...out.lines, ...out.problems],
    amount_cents: out.refundedCardCents + out.cashRefundCents,
    new_data: { fee_cents: out.feeCents, waived: !!by.waiveFee, cash_owed_cents: out.cashOwedCents },
    applied_at: now(),
  });
  await sb.from("audit_logs").insert({
    actor_id: by.kind === "customer" ? "guest" : by.userId ?? staffId,
    actor_role: by.kind === "customer" ? "customer" : by.employee?.role ?? "staff",
    action: "reservation.cancelled",
    table_name: "reservations",
    record_id: reservationId,
    new_data: {
      via: by.kind === "customer" ? "manage-reservation" : "dashboard",
      fee_cents: out.feeCents,
      refunded_card_cents: out.refundedCardCents,
      cash_refund_cents: out.cashRefundCents,
      cash_owed_cents: out.cashOwedCents,
      problems: out.problems,
    },
  });

  try {
    const info = await loadMessageInfo(sb, reservationId);
    if (info) await notifyCancelled(sb, info, [by.customerNote, out.customerLine].filter(Boolean).join(" "));
  } catch (err) {
    console.error("[cancellation] customer message failed", err);
  }
  if (by.kind === "customer") {
    await alertOnlineCancellation(sb, reservationId, [...out.lines.slice(1), ...out.problems].join("\n"));
  }

  return out;
}

function customerMoneyLine(r: CancelResult): string {
  const parts: string[] = [];
  if (r.feeCents > 0) parts.push(`A ${formatCents(r.feeCents)} cancellation fee applies.`);
  if (r.refundedCardCents > 0) parts.push(`${formatCents(r.refundedCardCents)} is being refunded to your card (allow 5–10 business days).`);
  if (r.holdReleased && r.feeCents === 0) parts.push("The hold on your card has been released — you were not charged.");
  else if (r.holdReleased) parts.push("The rest of the hold on your card has been released.");
  if (r.cashRefundCents > 0) parts.push(`${formatCents(r.cashRefundCents)} cash refunded.`);
  if (r.cashOwedCents > 0) parts.push(`Your cash refund of ${formatCents(r.cashOwedCents)} is ready at our Columbus office.`);
  if (r.problems.length) parts.push("Our team will contact you to finish your refund.");
  if (!parts.length) parts.push("Nothing was charged for this booking.");
  return parts.join(" ");
}
