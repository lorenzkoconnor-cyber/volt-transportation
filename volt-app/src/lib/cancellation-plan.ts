// ─── Cancellation money plan (pure — no imports, unit-tested) ─────────────────
// Given a reservation's payments and the cancellation fee, decides what to
// refund and how to settle card holds. src/lib/cancellation.ts carries it out.
//
//   • The fee comes out of money already paid first, then out of a card hold.
//   • Refunds go card first, then cash, newest payment first.
//   • Cash can't be refunded online: for a rider cancelling online it's marked
//     as still owed (collect at the office) instead.
//   • A card hold is captured for just the remaining fee (rest released), or
//     released in full when there's no fee left to collect.
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
  feeFromPaidCents: number;    // fee kept out of money already paid
  refunds: PlannedRefund[];
  holds: PlannedHold[];
  feeFromHoldsCents: number;   // fee to be captured from holds (if the capture succeeds)
}

const rank = (p: PlanPayment) => (p.method === "stripe" ? 0 : p.method === "cash" ? 1 : 2);
const net = (p: PlanPayment) => p.amount_cents - p.refund_amount_cents;

export function planCancellation(payments: PlanPayment[], feeCents: number, online: boolean): CancellationPlan {
  let feeLeft = Math.max(0, Math.round(feeCents));

  const paid = payments
    .filter((p) => p.status === "paid" && p.method !== "comp" && net(p) > 0)
    .sort((a, b) => rank(a) - rank(b) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const paidTotal = paid.reduce((s, p) => s + net(p), 0);
  const feeFromPaidCents = Math.min(feeLeft, paidTotal);
  feeLeft -= feeFromPaidCents;

  let refundLeft = paidTotal - feeFromPaidCents;
  const refunds: PlannedRefund[] = [];
  for (const p of paid) {
    if (refundLeft <= 0) break;
    const take = Math.min(refundLeft, net(p));
    refunds.push({ paymentId: p.id, method: p.method, amountCents: take, owedOnly: online && p.method === "cash" });
    refundLeft -= take;
  }

  const holds: PlannedHold[] = [];
  let feeFromHoldsCents = 0;
  for (const h of payments.filter((p) => p.status === "authorized")) {
    if (feeLeft > 0 && feeLeft <= h.amount_cents) {
      holds.push({ paymentId: h.id, action: "capture", amountCents: feeLeft });
      feeFromHoldsCents += feeLeft;
      feeLeft = 0;
    } else {
      holds.push({ paymentId: h.id, action: "void", amountCents: 0 });
    }
  }

  return { feeFromPaidCents, refunds, holds, feeFromHoldsCents };
}
