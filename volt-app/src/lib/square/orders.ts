// ─── Square order builder (pure — no I/O) ─────────────────────────────────────
// Turns a reservation + the payment being taken into the itemized cart shown on
// the Square Terminal (and on Square's receipt and sales reports):
//
//   Adult ticket (Outbound)   2 × $59     Columbus → ATL · Oct 22
//   Adult ticket (Return)     2 × $59     ATL → Columbus · Oct 25
//   Extra bag (Outbound)      1 × $15
//   − Military Discount               −$10
//   − Paid in cash                    −$20   (split: the cash part)
//   = amount charged on the Terminal
//
// The total MUST equal the amount being charged — Square rejects a Terminal
// checkout whose amount doesn't match its order, and Volt refuses to send a
// cart that doesn't add up.

export interface OrderPricing { adult: number; child: number; pet: number; extraBag: number } // dollars

export interface OrderReservation {
  confirmationNumber: string;
  adults: number;
  children: number;
  pets: number;
  extraBags: number;
  isRoundTrip: boolean;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountLabel: string | null;  // "Military Discount", "Discount code SPRING10", …
  pricing: OrderPricing;         // the booking's own prices (pricing_snapshot)
  outboundLabel: string;         // "Columbus → ATL · Oct 22, 8:00 AM"
  returnLabel: string | null;
}

export interface OrderCharge {
  amountCents: number;           // what the Terminal will charge
  // Set when this payment is the extra charge for a reservation change.
  change?: { priceChangeCents: number; summary: string[] } | null;
  // What the rest of the cart was paid with (split → "Paid in cash").
  paidElsewhereLabel: string;
}

export interface BuiltLine { name: string; quantity: number; unitCents: number; variation?: string; note?: string }
export interface BuiltDiscount { name: string; cents: number }
export type BuiltOrder =
  | { ok: true; lines: BuiltLine[]; discounts: BuiltDiscount[]; totalCents: number }
  | { ok: false; error: string };

const cents = (dollars: number) => Math.round(dollars * 100);

export function orderTotalCents(lines: BuiltLine[], discounts: BuiltDiscount[]): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitCents, 0) - discounts.reduce((s, d) => s + d.cents, 0);
}

export function buildSquareOrder(r: OrderReservation, charge: OrderCharge): BuiltOrder {
  const amount = Math.round(charge.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Nothing to charge." };

  let lines: BuiltLine[];
  const discounts: BuiltDiscount[] = [];
  let coveredCents: number; // what the lines + booking discounts add up to

  if (charge.change) {
    // Extra charge for an edit: one line for the difference.
    const diff = charge.change.priceChangeCents;
    if (diff <= 0) return { ok: false, error: "This change doesn't cost anything extra." };
    const detail = charge.change.summary.filter((s) => !s.startsWith("Price:")).join("; ");
    lines = [{ name: "Reservation change", quantity: 1, unitCents: diff, variation: r.confirmationNumber, note: detail || undefined }];
    coveredCents = diff;
  } else {
    lines = ticketLines(r);
    // Old bookings or edited prices can drift from the per-item math — fall
    // back to one fare line rather than send a cart that doesn't match.
    if (orderTotalCents(lines, []) !== r.subtotalCents) {
      lines = [{
        name: "Volt shuttle fare", quantity: 1, unitCents: r.subtotalCents,
        variation: r.isRoundTrip ? "Round trip" : "One way", note: partySummary(r),
      }];
    }
    if (r.discountCents > 0) discounts.push({ name: r.discountLabel || "Discount", cents: r.discountCents });
    coveredCents = r.totalCents;
  }

  if (amount > coveredCents) return { ok: false, error: "The amount is more than this booking costs." };
  const elsewhere = coveredCents - amount;
  if (elsewhere > 0) discounts.push({ name: charge.paidElsewhereLabel, cents: elsewhere });

  const totalCents = orderTotalCents(lines, discounts);
  if (totalCents !== amount) {
    return { ok: false, error: `The itemized cart (${totalCents}¢) doesn't match the charge (${amount}¢).` };
  }
  return { ok: true, lines, discounts, totalCents };
}

function ticketLines(r: OrderReservation): BuiltLine[] {
  const legs: { tag: string; label: string }[] = [{ tag: r.isRoundTrip ? " (Outbound)" : "", label: r.outboundLabel }];
  if (r.isRoundTrip) legs.push({ tag: " (Return)", label: r.returnLabel ?? "Return trip" });
  const items: [string, number, number][] = [
    ["Adult ticket", r.adults, cents(r.pricing.adult)],
    ["Child ticket", r.children, cents(r.pricing.child)],
    ["Pet fee", r.pets, cents(r.pricing.pet)],
    ["Extra bag", r.extraBags, cents(r.pricing.extraBag)],
  ];
  const lines: BuiltLine[] = [];
  for (const leg of legs) {
    for (const [name, qty, unit] of items) {
      if (qty > 0 && unit > 0) lines.push({ name: `${name}${leg.tag}`, quantity: qty, unitCents: unit, variation: leg.label });
    }
  }
  return lines;
}

function partySummary(r: OrderReservation): string {
  const parts = [
    r.adults && `${r.adults} adult${r.adults > 1 ? "s" : ""}`,
    r.children && `${r.children} child${r.children > 1 ? "ren" : ""}`,
    r.pets && `${r.pets} pet${r.pets > 1 ? "s" : ""}`,
    r.extraBags && `${r.extraBags} extra bag${r.extraBags > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return parts.join(", ");
}
