// ─── Staff booking pricing — shared by the Team Portal forms and the server ────
// New Reservation and Edit Reservation price a booking the same way the
// customer checkout does (PRICING × 2 for round trips), plus the discounts
// staff can give at the counter. The server re-prices everything from the same
// inputs, so the browser's numbers are only a preview.

import { MILITARY_DISCOUNT_PERCENT, MILITARY_DISCOUNT_RATE, PRICING } from "@/lib/booking";
import { codeDiscountCents, codeLabel } from "@/lib/discount-codes";

export type StaffDiscount =
  | { kind: "none" }
  // Military ID checked in person by staff (no upload).
  | { kind: "military" }
  // One-time discount code. `type`/`value` come from the validate API; the
  // server looks the code up again.
  | { kind: "code"; code: string; type: "percent" | "fixed"; value: number }
  // Staff-entered discount: dollars ("amount") or percent.
  | { kind: "manual"; type: "amount" | "percent"; value: number };

export interface StaffCounts {
  adults: number;
  children: number;
  pets: number;
  extraBags: number;
  isRoundTrip: boolean;
}

export interface StaffPrice {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export function staffSubtotalCents(c: StaffCounts): number {
  const oneWay = c.adults * PRICING.adult + c.children * PRICING.child + c.pets * PRICING.pet + c.extraBags * PRICING.extraBag;
  return oneWay * (c.isRoundTrip ? 2 : 1) * 100;
}

export function staffDiscountCents(subtotalCents: number, d: StaffDiscount): number {
  switch (d.kind) {
    case "military":
      return Math.round(subtotalCents * MILITARY_DISCOUNT_RATE);
    case "code":
      return codeDiscountCents(subtotalCents, { type: d.type, value: d.value });
    case "manual": {
      const v = Math.max(0, Number(d.value) || 0);
      const cents = d.type === "percent" ? Math.round((subtotalCents * Math.min(v, 100)) / 100) : Math.round(v * 100);
      return Math.min(subtotalCents, cents);
    }
    default:
      return 0;
  }
}

/** `comp` = the whole booking is free (Comp payment). */
export function staffPrice(c: StaffCounts, d: StaffDiscount, comp = false): StaffPrice {
  const subtotalCents = staffSubtotalCents(c);
  const discountCents = comp ? subtotalCents : staffDiscountCents(subtotalCents, d);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

// ── Edit windows ──────────────────────────────────────────────────────────────
//   • More than EDIT_CUTOFF_HOURS before the outbound departure: any staff
//     (owner, manager, office staff) can change anything.
//   • Inside that window: only owners and managers — everything until the
//     outbound leaves, then just the return leg until RETURN_CUTOFF_HOURS
//     before the return departure.
export const EDIT_CUTOFF_HOURS = 24;
export const RETURN_CUTOFF_HOURS = 2;
const LATE_EDIT_ROLES = ["owner", "manager"];

// Departure times are Eastern wall-clock times; this turns one into a real
// instant (ms since epoch), handling daylight saving.
function nyOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

export function easternInstant(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall - nyOffsetMs(wall);
  const again = nyOffsetMs(t);
  if (wall - again !== t) t = wall - again;
  return t;
}

type TripTime = { departure_date: string; departure_time: string } | null | undefined;

export type EditMode = "full" | "return_only";

/** What `role` may change on a reservation right now, and why not if nothing. */
export function editAccess(
  role: string | null | undefined,
  status: string,
  outbound: TripTime,
  returnTrip: TripTime,
  now = Date.now(),
): { mode: EditMode | null; reason: string | null } {
  if (status === "cancelled") return { mode: null, reason: "This reservation is cancelled." };
  if (status === "completed" || status === "no_show") return { mode: null, reason: "This trip is already finished." };
  if (!outbound) return { mode: null, reason: "This reservation has no trip." };
  const at = (t: NonNullable<TripTime>) => easternInstant(t.departure_date, t.departure_time.slice(0, 5));
  const untilOut = at(outbound) - now;
  if (untilOut >= EDIT_CUTOFF_HOURS * 3_600_000) return { mode: "full", reason: null };
  if (!LATE_EDIT_ROLES.includes(role ?? "")) {
    return { mode: null, reason: `Within ${EDIT_CUTOFF_HOURS} hours of departure, only an owner or manager can make changes.` };
  }
  if (untilOut > 0) return { mode: "full", reason: null };
  if (returnTrip && at(returnTrip) - now > RETURN_CUTOFF_HOURS * 3_600_000) return { mode: "return_only", reason: null };
  return {
    mode: null,
    reason: returnTrip
      ? `The return trip can't be changed within ${RETURN_CUTOFF_HOURS} hours of its departure.`
      : "This trip has already departed.",
  };
}

// ── Balance ───────────────────────────────────────────────────────────────────
export interface PaymentLike {
  method: string;
  status: string;
  amount_cents: number;
  refund_amount_cents: number;
  reservation_change_id?: string | null;
}

/**
 * Money collected vs. the reservation total. After an edit lowers the price,
 * `refundDueCents` is what the customer is owed back (refunded only when staff
 * press Refund).
 */
export function reservationBalance(totalCents: number, payments: PaymentLike[]) {
  let collectedCents = 0;
  let pendingCents = 0;
  for (const p of payments) {
    if (p.status === "paid" || p.status === "authorized" || p.status === "refunded") {
      collectedCents += p.amount_cents - (p.refund_amount_cents ?? 0);
    } else if (p.status === "pending" && !p.reservation_change_id) {
      pendingCents += p.amount_cents;
    }
  }
  return {
    collectedCents,
    pendingCents,
    refundDueCents: Math.max(0, collectedCents - totalCents),
  };
}

export function staffDiscountLabel(d: StaffDiscount): string {
  switch (d.kind) {
    case "military":
      return `Military Discount (${MILITARY_DISCOUNT_PERCENT}%)`;
    case "code":
      return `Discount Code ${d.code} (${codeLabel({ type: d.type, value: d.value })})`;
    case "manual":
      return d.type === "percent" ? `Discount (${Math.min(d.value, 100)}%)` : "Discount";
    default:
      return "";
  }
}
