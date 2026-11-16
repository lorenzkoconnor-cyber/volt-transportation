// ─── Driver tips: who earned what ─────────────────────────────────────────────
// A booking's tip (reservations.tip_cents, which already includes tips paid
// after the trip) is credited to the driver(s) of the leg(s) the rider rode:
//   • one-way: all of it to that trip's driver
//   • round trip: split evenly, outbound gets the odd cent
//   • several drivers on one trip (two vans): split evenly between them
//   • no driver assigned yet: "Unassigned" until someone is put on the van
// Card tips (Stripe / Square) pay the driver the tip minus the estimated
// processing fee. A leg only counts once it has run, and a booking tip only
// once the booking itself is paid. Pure — no I/O.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Leg = "out" | "ret";

export interface TipShare {
  key: string;                 // "<reservation id>:<leg>" (+ driver in the per-driver list)
  reservationId: string;
  confirmation: string;
  customer: string;
  leg: Leg;
  roundTrip: boolean;
  date: string;                // the leg's departure date
  time: string;                // "HH:MM"
  route: string;
  driverId: string | null;     // null = no driver on the van yet
  driverName: string;
  grossCents: number;          // this driver's part of the tip
  feeCents: number;            // card fee taken out of it
  netCents: number;            // what the driver is owed
  paidCents: number;           // already handed over
  owedCents: number;           // netCents − paidCents (never below 0)
}

const CARD = new Set(["stripe", "square"]);
const net = (p: any) => Math.max(0, (p.amount_cents ?? 0) - (p.refund_amount_cents ?? 0));

/** Splits `cents` into `n` whole-cent parts; the first parts get the leftovers. */
export function splitCents(cents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Tip, card fee and "is it countable yet" for one reservation. */
export function tipTotals(resv: any, feePercent: number): { grossCents: number; feeCents: number; bookingPaid: boolean } {
  const pays: any[] = resv.payments ?? [];
  const tipRows = pays.filter((p) => p.is_tip && (p.status === "paid" || p.status === "refunded"));
  const postCents = tipRows.reduce((s, p) => s + net(p), 0);
  const bookingTip = Math.max(0, (resv.tip_cents ?? 0) - postCents);

  // The booking's own payments (not later tips, not edit charges' refunds).
  const own = pays.filter((p) => !p.is_tip);
  const bookingPaid = !own.some((p) => p.status === "pending" || p.status === "authorized");
  const paidOwn = own.filter((p) => p.status === "paid" || p.status === "refunded");
  const ownTotal = paidOwn.filter((p) => p.method !== "comp").reduce((s, p) => s + net(p), 0);
  const ownCard = paidOwn.filter((p) => CARD.has(p.method)).reduce((s, p) => s + net(p), 0);
  const cardShare = ownTotal > 0 ? ownCard / ownTotal : 0;

  const rate = Math.max(0, feePercent) / 100;
  const bookingFee = Math.round(bookingTip * rate * cardShare);
  const postFee = tipRows.filter((p) => CARD.has(p.method)).reduce((s, p) => s + Math.round(net(p) * rate), 0);

  const countedBooking = bookingPaid ? bookingTip : 0;
  return {
    grossCents: countedBooking + postCents,
    feeCents: (bookingPaid ? bookingFee : 0) + postFee,
    bookingPaid,
  };
}

/** Has this leg's van run? (Departed, finished, or the date has passed.) */
export function legHasRun(trip: any, today: string): boolean {
  if (!trip || trip.status === "cancelled") return false;
  return trip.status === "in_progress" || trip.status === "completed" || trip.departure_date < today;
}

/**
 * Every driver's share of every tip. `reservations` rows need: id,
 * confirmation_number, tip_cents, is_round_trip, status, customer(first_name,
 * last_name), payments(method, status, amount_cents, refund_amount_cents,
 * is_tip), trip / return_trip(id, departure_date, departure_time, status,
 * route(name), trip_vehicles(driver(id, first_name, last_name))).
 * `paid` is the sum already handed over per "<share key>|<driver id>".
 */
export function tipShares(reservations: any[], opts: { feePercent: number; today: string; paid: Record<string, number> }): TipShare[] {
  const out: TipShare[] = [];
  for (const r of reservations) {
    if (r.status === "cancelled" || r.deleted_at || !(r.tip_cents > 0)) continue;
    const { grossCents, feeCents } = tipTotals(r, opts.feePercent);
    if (grossCents <= 0) continue;

    const legs: { leg: Leg; trip: any }[] = [{ leg: "out", trip: r.trip }];
    if (r.is_round_trip && r.return_trip) legs.push({ leg: "ret", trip: r.return_trip });
    const grossParts = splitCents(grossCents, legs.length);
    const feeParts = splitCents(feeCents, legs.length);

    legs.forEach(({ leg, trip }, i) => {
      if (!legHasRun(trip, opts.today)) return;
      const drivers: { id: string | null; name: string }[] = [];
      for (const tv of trip.trip_vehicles ?? []) {
        const d = tv.driver;
        if (d?.id && !drivers.some((x) => x.id === d.id)) drivers.push({ id: d.id, name: `${d.first_name} ${d.last_name ?? ""}`.trim() });
      }
      if (!drivers.length) drivers.push({ id: null, name: "Unassigned" });
      const g = splitCents(grossParts[i], drivers.length);
      const f = splitCents(feeParts[i], drivers.length);
      drivers.forEach((d, j) => {
        const shareKey = `${r.id}:${leg}`;
        const netCents = g[j] - f[j];
        const paidCents = d.id ? opts.paid[`${shareKey}|${d.id}`] ?? 0 : 0;
        out.push({
          key: `${shareKey}|${d.id ?? "none"}`,
          reservationId: r.id,
          confirmation: r.confirmation_number ?? "",
          customer: r.customer ? `${r.customer.first_name ?? ""} ${(r.customer.last_name ?? "").slice(0, 1)}.`.trim() : "—",
          leg,
          roundTrip: legs.length > 1,
          date: trip.departure_date,
          time: (trip.departure_time ?? "").slice(0, 5),
          route: trip.route?.name ?? "",
          driverId: d.id,
          driverName: d.name,
          grossCents: g[j],
          feeCents: f[j],
          netCents,
          paidCents,
          // Never negative: a refund or fee change after a payout isn't taken back from the driver.
          owedCents: d.id ? Math.max(0, netCents - paidCents) : 0,
        });
      });
    });
  }
  return out.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
}

/** Share key ("<reservation id>:<leg>") back out of a TipShare.key. */
export const shareKeyOf = (key: string) => key.split("|")[0];
