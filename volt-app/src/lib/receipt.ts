// ─── Receipt data (server-only) ───────────────────────────────────────────────
// Everything a printed / texted receipt shows, read with the service role by
// the reservation's unguessable receipt_token.

import { createAdminDb } from "@/lib/checkout";
import { snapshotPricing } from "@/lib/settings";
import { codeLabel } from "@/lib/discount-codes";
import { reservationBalance } from "@/lib/staff-pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReceiptLeg {
  label: string;           // "Outbound" | "Return" | "Trip"
  from: string;
  to: string;
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM:SS
  flight: { airline: string; number: string; terminal: string; date: string; time: string; departing: boolean } | null;
}

export interface ReceiptData {
  confirmationNumber: string;
  status: string;
  bookedAt: string;
  updatedAt: string;
  customer: { name: string; phone: string; email: string };
  legs: ReceiptLeg[];
  passengers: string[];
  lines: { label: string; cents: number }[];
  subtotalCents: number;
  discount: { label: string; cents: number } | null;
  totalCents: number;
  payments: { label: string; date: string; cents: number; status: string; refundedCents: number }[];
  paidCents: number;
  balanceDueCents: number;
  refundDueCents: number;
  notes: string | null;
}

const METHOD_LABEL: Record<string, string> = { stripe: "Card", square: "Card (Square Terminal)", cash: "Cash", comp: "Complimentary" };

export async function loadReceipt(token: string): Promise<ReceiptData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb: any = createAdminDb();
  const { data: r } = await sb
    .from("reservations")
    .select(
      "*, customer:customers(first_name, last_name, phone, email), " +
      "trip:trips!reservations_trip_id_fkey(id, departure_date, departure_time, route:routes(origin_label, destination_label)), " +
      "return_trip:trips!reservations_return_trip_id_fkey(id, departure_date, departure_time, route:routes(origin_label, destination_label)), " +
      "reservation_passengers(name, is_primary, created_at), " +
      "reservation_flights(leg, direction, airline, flight_number, terminal, flight_date, flight_time), " +
      "payments(method, status, amount_cents, refund_amount_cents, reservation_change_id, created_at, captured_at), " +
      "discount_code:discount_codes!reservations_discount_code_id_fkey(code, discount_type, value)",
    )
    .eq("receipt_token", token)
    .maybeSingle();
  if (!r) return null;

  const flights = r.reservation_flights ?? [];
  const leg = (label: string, t: any, legKey: string): ReceiptLeg => {
    const f = flights.find((x: any) => x.leg === legKey);
    return {
      label,
      from: t?.route?.origin_label ?? "",
      to: t?.route?.destination_label ?? "",
      date: t?.departure_date ?? "",
      time: t?.departure_time ?? "",
      flight: f
        ? { airline: f.airline, number: f.flight_number, terminal: f.terminal, date: f.flight_date, time: f.flight_time, departing: f.direction === "departing" }
        : null,
    };
  };
  const roundTrip = r.is_round_trip && r.return_trip;
  const legs = roundTrip
    ? [leg("Outbound", r.trip, "outbound"), leg("Return", r.return_trip, "return")]
    : [leg("Trip", r.trip, "outbound")];

  // Line items from the party at the prices the booking was made at (× 2 for
  // round trips). Anything that doesn't add up falls back to one subtotal line.
  const { pricing: P } = snapshotPricing(r.pricing_snapshot);
  const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
  const mult = roundTrip ? 2 : 1;
  const rt = roundTrip ? " · round trip" : "";
  const items: { label: string; cents: number }[] = [];
  const add = (n: number, one: string, many: string, price: number) => {
    if (n > 0) items.push({ label: `${n} ${n === 1 ? one : many} × ${usd(price)}${rt}`, cents: Math.round(n * price * 100 * mult) });
  };
  add(r.adults, "Adult", "Adults", P.adult);
  add(r.children, "Child", "Children", P.child);
  add(r.pets, "Pet", "Pets", P.pet);
  add(r.extra_bags, "Extra Bag", "Extra Bags", P.extraBag);
  const lines = items.reduce((n, l) => n + l.cents, 0) === r.subtotal_cents
    ? items
    : [{ label: "Fare", cents: r.subtotal_cents }];

  const discountLabel = r.discount_code
    ? `Discount code ${r.discount_code.code} (${codeLabel({ type: r.discount_code.discount_type, value: r.discount_code.value })})`
    : r.is_military ? "Military Discount"
    : r.total_cents === 0 ? "Complimentary"
    : "Discount";

  const payments = (r.payments ?? [])
    .filter((p: any) => ["paid", "authorized", "refunded"].includes(p.status) && (p.amount_cents > 0 || p.method === "comp"))
    .sort((a: any, b: any) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map((p: any) => ({
      label: `${METHOD_LABEL[p.method] ?? p.method}${p.reservation_change_id ? " — change" : ""}${p.status === "authorized" ? " (on hold)" : ""}`,
      date: p.captured_at ?? p.created_at,
      cents: p.amount_cents,
      status: p.status,
      refundedCents: p.refund_amount_cents ?? 0,
    }));
  const balance = reservationBalance(r.total_cents, r.payments ?? []);

  const passengers = [...(r.reservation_passengers ?? [])]
    .sort((a: any, b: any) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map((p: any) => p.name);

  const email = r.customer?.email ?? "";
  return {
    confirmationNumber: r.confirmation_number,
    status: r.status,
    bookedAt: r.created_at,
    updatedAt: r.updated_at,
    customer: {
      name: `${r.customer?.first_name ?? ""} ${r.customer?.last_name ?? ""}`.trim(),
      phone: r.customer?.phone ?? "",
      email: email.endsWith("@walkin.volt") || email.endsWith("@guest.volt") ? "" : email,
    },
    legs,
    passengers,
    lines,
    subtotalCents: r.subtotal_cents,
    discount: r.discount_cents > 0 ? { label: discountLabel, cents: r.discount_cents } : null,
    totalCents: r.total_cents,
    payments,
    paidCents: balance.collectedCents,
    balanceDueCents: Math.max(0, r.total_cents - balance.collectedCents),
    refundDueCents: balance.refundDueCents,
    notes: r.special_notes,
  };
}
