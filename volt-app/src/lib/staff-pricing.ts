// ─── Staff booking pricing — shared by the Team Portal forms and the server ────
// New Reservation and Edit Reservation price a booking the same way the
// customer checkout does (prices × 2 for round trips), plus the discounts
// staff can give at the counter. The server re-prices everything from the same
// inputs, so the browser's numbers are only a preview.
// `rates` = the prices + Military Discount amount to use: the live settings for a new
// booking, the booking's own price snapshot for an edit. Defaults: the originals.

import { MILITARY_DISCOUNT_AMOUNT, PRICING, militaryDiscountCents } from "@/lib/booking";
import { codeDiscountCents, codeLabel } from "@/lib/discount-codes";
import { dollars } from "@/lib/settings";

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
  doorCents: number;   // door pickup + drop-off fees (never discounted)
  tipCents: number;
  totalCents: number;  // subtotal − discount + door + tip
}

// Door-to-door service picked in the Team Portal: what's charged for it.
export interface StaffExtras {
  pickupFeeCents: number;
  dropoffFeeCents: number;
  tipCents: number;
}
export const NO_EXTRAS: StaffExtras = { pickupFeeCents: 0, dropoffFeeCents: 0, tipCents: 0 };

export interface StaffRates {
  pricing: { adult: number; child: number; pet: number; extraBag: number };
  militaryAmount: number; // dollars
}

export const DEFAULT_RATES: StaffRates = { pricing: PRICING, militaryAmount: MILITARY_DISCOUNT_AMOUNT };

export function staffSubtotalCents(c: StaffCounts, rates: StaffRates = DEFAULT_RATES): number {
  const P = rates.pricing;
  const oneWay = c.adults * P.adult + c.children * P.child + c.pets * P.pet + c.extraBags * P.extraBag;
  return Math.round(oneWay * (c.isRoundTrip ? 2 : 1) * 100);
}

export function staffDiscountCents(subtotalCents: number, d: StaffDiscount, rates: StaffRates = DEFAULT_RATES): number {
  switch (d.kind) {
    case "military":
      return militaryDiscountCents(subtotalCents, rates.militaryAmount);
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

/** `comp` = the whole booking is free (Comp payment) — fare and door fees; no tip. */
export function staffPrice(
  c: StaffCounts, d: StaffDiscount, comp = false, rates: StaffRates = DEFAULT_RATES, extras: StaffExtras = NO_EXTRAS,
): StaffPrice {
  const subtotalCents = staffSubtotalCents(c, rates);
  const doorCents = extras.pickupFeeCents + extras.dropoffFeeCents;
  const tipCents = comp ? 0 : extras.tipCents;
  const discountCents = comp ? subtotalCents + doorCents : staffDiscountCents(subtotalCents, d, rates);
  return { subtotalCents, discountCents, doorCents, tipCents, totalCents: subtotalCents - discountCents + doorCents + tipCents };
}

// ── Edit windows ──────────────────────────────────────────────────────────────
//   • More than `editCutoffHours` (Settings; default 24) before the outbound
//     departure: any staff (owner, manager, office staff) can change anything.
//   • Inside that window: only owners and managers — everything until the
//     outbound leaves, then just the return leg until `returnEditCutoffHours`
//     (default 2) before the return departure.
export const EDIT_CUTOFF_HOURS = 24;
export const RETURN_CUTOFF_HOURS = 2;

export interface EditWindows {
  editCutoffHours: number;
  returnEditCutoffHours: number;
}
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
  windows: EditWindows = { editCutoffHours: EDIT_CUTOFF_HOURS, returnEditCutoffHours: RETURN_CUTOFF_HOURS },
): { mode: EditMode | null; reason: string | null } {
  const EDIT_H = windows.editCutoffHours;
  const RETURN_H = windows.returnEditCutoffHours;
  if (status === "cancelled") return { mode: null, reason: "This reservation is cancelled." };
  if (status === "completed" || status === "no_show") return { mode: null, reason: "This trip is already finished." };
  if (!outbound) return { mode: null, reason: "This reservation has no trip." };
  const at = (t: NonNullable<TripTime>) => easternInstant(t.departure_date, t.departure_time.slice(0, 5));
  const untilOut = at(outbound) - now;
  if (untilOut >= EDIT_H * 3_600_000) return { mode: "full", reason: null };
  if (!LATE_EDIT_ROLES.includes(role ?? "")) {
    return { mode: null, reason: `Within ${EDIT_H} hours of departure, only an owner or manager can make changes.` };
  }
  if (untilOut > 0) return { mode: "full", reason: null };
  if (returnTrip && at(returnTrip) - now > RETURN_H * 3_600_000) return { mode: "return_only", reason: null };
  return {
    mode: null,
    reason: returnTrip
      ? `The return trip can't be changed within ${RETURN_H} hours of its departure.`
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

export function staffDiscountLabel(d: StaffDiscount, rates: StaffRates = DEFAULT_RATES): string {
  switch (d.kind) {
    case "military":
      return `Military Discount (−${dollars(rates.militaryAmount)})`;
    case "code":
      return `Discount Code ${d.code} (${codeLabel({ type: d.type, value: d.value })})`;
    case "manual":
      return d.type === "percent" ? `Discount (${Math.min(d.value, 100)}%)` : "Discount";
    default:
      return "";
  }
}
