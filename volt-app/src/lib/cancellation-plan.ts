// ─── Cancellation money plan (pure — no imports, unit-tested) ─────────────────
// amountToKeep() decides how much of a booking Volt keeps; planCancellation()
// decides, from the payments, what to refund and how to settle card holds.
// src/lib/cancellation.ts carries it out.
//
//   • Staff pick "partial refund" (keep the fee, plus the ride already taken
//     and any tip if the first leg has run) or "no refund" (keep everything).
//   • The kept amount comes out of money already paid first, then a card hold.
//   • Refunds go card first, then cash, newest payment first.
//   • Cash can't be refunded online: for a rider cancelling online it's marked
//     as still owed (collect at the office) instead.
//   • A card hold is captured for just what's left to keep (rest released), or
//     released in full when there's nothing left to keep.
//   • Comp (free) payments and unfinished payments are never refunded.

export interface PlanPayment {
  id: string;
  method: string;              // 'stripe' | 'cash' | 'comp'
  status: string;              // 'paid' | 'authorized' | 'pending' | ...
  amount_cents: number;
  refund_amount_cents: number;
  created_at?: string | null;
}

export interface PlannedRefund {
  paymentId: string;
  method: string;
  amountCents: number;
  owedOnly: boolean;           // cash a rider must collect in person (nothing is recorded yet)
}

export interface PlannedHold {
  paymentId: string;
  action: "capture" | "void";
  amountCents: number;         // capture amount (0 for void)
}

export interface CancellationPlan {
  keptFromPaidCents: number;   // kept out of money already paid
  refunds: PlannedRefund[];
  holds: PlannedHold[];
  keptFromHoldsCents: number;  // to be captured from holds (if the capture succeeds)
}

export type RefundMode = "partial" | "none";

/** Stands in for "keep everything" — more than any booking could ever cost. */
export const KEEP_ALL_CENTS = 1_000_000_000;

export interface KeepInput {
  mode: RefundMode;
  feeCents: number;            // cancellation fee (0 when waived)
  firstLegTaken: boolean;      // the outbound van has already run
  roundTrip: boolean;
  totalCents: number;          // reservation total (fare + door fees + tip)
  tipCents: number;            // every tip on the booking
  pickupFeeCents: number;      // door pickup — part of the first leg
  dropoffFeeCents: number;     // door drop-off — part of the last leg
}

export interface KeepAmounts {
  keepAll: boolean;            // "no refund"
  usedRideCents: number;       // the ride already taken (incl. its door fee)
  tipCents: number;            // tip kept for the driver
  feeCents: number;            // cancellation fee
  totalCents: number;          // what to keep in all (KEEP_ALL_CENTS for "no refund")
}

/**
 * How much of a booking to keep when it's cancelled.
 *   • No refund: everything.
 *   • Partial refund, no ride taken yet: just the fee.
 *   • Partial refund after the first leg ran: the fee + the ride taken (half
 *     the fare, plus a door pickup) + the tip. A one-way already taken keeps
 *     everything — there's no ride left to refund.
 */
export function amountToKeep(i: KeepInput): KeepAmounts {
  const fee = Math.max(0, Math.round(i.feeCents));
  if (i.mode === "none") return { keepAll: true, usedRideCents: 0, tipCents: 0, feeCents: 0, totalCents: KEEP_ALL_CENTS };
  if (!i.firstLegTaken) return { keepAll: false, usedRideCents: 0, tipCents: 0, feeCents: fee, totalCents: fee };

  const tip = Math.max(0, i.tipCents);
  const pickup = Math.max(0, i.pickupFeeCents);
  const dropoff = Math.max(0, i.dropoffFeeCents);
  const fare = Math.max(0, i.totalCents - tip - pickup - dropoff);
  // Round trip: the untaken return is half the fare (rounded down) plus a door drop-off.
  const usedRide = i.roundTrip ? fare - Math.floor(fare / 2) + pickup : fare + pickup + dropoff;
  return { keepAll: false, usedRideCents: usedRide, tipCents: tip, feeCents: fee, totalCents: usedRide + tip + fee };
}

// Cards (Stripe or Square Terminal) first, then cash.
const rank = (p: PlanPayment) => (p.method === "stripe" || p.method === "square" ? 0 : p.method === "cash" ? 1 : 2);
const net = (p: PlanPayment) => p.amount_cents - p.refund_amount_cents;

/** `keepCents` = how much Volt keeps (see amountToKeep); everything else paid is refunded. */
export function planCancellation(payments: PlanPayment[], keepCents: number, online: boolean): CancellationPlan {
  let keepLeft = Math.max(0, Math.round(keepCents));

  const paid = payments
    .filter((p) => p.status === "paid" && p.method !== "comp" && net(p) > 0)
    .sort((a, b) => rank(a) - rank(b) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const paidTotal = paid.reduce((s, p) => s + net(p), 0);
  const keptFromPaidCents = Math.min(keepLeft, paidTotal);
  keepLeft -= keptFromPaidCents;

  let refundLeft = paidTotal - keptFromPaidCents;
  const refunds: PlannedRefund[] = [];
  for (const p of paid) {
    if (refundLeft <= 0) break;
    const take = Math.min(refundLeft, net(p));
    refunds.push({ paymentId: p.id, method: p.method, amountCents: take, owedOnly: online && p.method === "cash" });
    refundLeft -= take;
  }

  const holds: PlannedHold[] = [];
  let keptFromHoldsCents = 0;
  for (const h of payments.filter((p) => p.status === "authorized")) {
    if (keepLeft > 0 && h.amount_cents > 0) {
      const take = Math.min(keepLeft, h.amount_cents);
      holds.push({ paymentId: h.id, action: "capture", amountCents: take });
      keptFromHoldsCents += take;
      keepLeft -= take;
    } else {
      holds.push({ paymentId: h.id, action: "void", amountCents: 0 });
    }
  }

  return { keptFromPaidCents, refunds, holds, keptFromHoldsCents };
}
