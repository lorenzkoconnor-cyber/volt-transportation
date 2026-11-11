// Reservation status wording and badge colors for the staff dashboard.
// The database value 'confirmed' is shown to staff as "Booked": the seat is
// held, but a staff booking may still have payment to collect. Customers still
// see "Confirmed" on Manage Reservation.

import { easternToday } from "@/lib/format";
import { reservationBalance, type PaymentLike } from "@/lib/staff-pricing";

export const STATUS_LABELS: Record<string, string> = {
  confirmed: "Booked",
  pending:   "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show:   "No show",
};

export const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-[#FCC300]/15 text-[#FCC300]",
  pending:   "bg-white/10 text-[#A1A1AA]",
  completed: "bg-green-500/15 text-green-400",
  cancelled: "bg-red-500/15 text-red-400",
  no_show:   "bg-orange-500/15 text-orange-400",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace("_", " ");
}

// A booking can be marked completed from its badge once the day of its last
// ride (the return trip, for a round trip) has arrived in Eastern time.
export function canQuickComplete(status: string, lastRideDate: string | null | undefined): boolean {
  return status === "confirmed" && !!lastRideDate && lastRideDate <= easternToday();
}

// ─── Payment state (reservations list "Payment" column) ──────────────────────
// Uses the same money math as receipts (reservationBalance).

export type PaymentState = "paid" | "on_hold" | "partial" | "pending" | "unpaid" | "refund_due" | "refunded" | "free";

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  paid:       "Paid",
  on_hold:    "Card on hold",
  partial:    "Partly paid",
  pending:    "Pending",
  unpaid:     "Unpaid",
  refund_due: "Refund due",
  refunded:   "Refunded",
  free:       "No charge",
};

export const PAYMENT_STYLES: Record<PaymentState, string> = {
  paid:       "bg-green-500/15 text-green-400",
  on_hold:    "bg-sky-500/15 text-sky-400",
  partial:    "bg-orange-500/15 text-orange-400",
  pending:    "bg-[#FCC300]/15 text-[#FCC300]",
  unpaid:     "bg-red-500/15 text-red-400",
  refund_due: "bg-purple-500/15 text-purple-300",
  refunded:   "bg-white/10 text-[#A1A1AA]",
  free:       "bg-white/10 text-[#A1A1AA]",
};

export interface PaymentSummary {
  state: PaymentState;
  dueCents: number;      // still owed (partial / pending / unpaid)
  refundCents: number;   // owed back to the rider (refund_due)
}

export function paymentSummary(totalCents: number, reservationStatus: string, payments: PaymentLike[]): PaymentSummary {
  const { collectedCents, refundDueCents } = reservationBalance(totalCents, payments);
  const due = Math.max(0, totalCents - collectedCents);
  const onHold = payments.some((p) => p.status === "authorized");
  const refunded = payments.some((p) => (p.refund_amount_cents ?? 0) > 0);
  const pending = payments.some((p) => p.status === "pending");

  // Cancelling keeps the original total and records refunds on the payments,
  // so a cancelled booking is never "owed": it was refunded, kept what was
  // paid (e.g. the cancellation fee), or never charged.
  if (reservationStatus === "cancelled") {
    const state: PaymentState = refunded ? "refunded" : collectedCents > 0 ? "paid" : pending || onHold ? "pending" : "free";
    return { state, dueCents: 0, refundCents: 0 };
  }

  const state: PaymentState =
    refundDueCents > 0 ? "refund_due"
    : totalCents <= 0 ? "free"
    : due === 0 ? (onHold ? "on_hold" : "paid")
    : collectedCents > 0 ? "partial"
    : pending ? "pending"
    : "unpaid";

  return { state, dueCents: ["partial", "pending", "unpaid"].includes(state) ? due : 0, refundCents: refundDueCents };
}
