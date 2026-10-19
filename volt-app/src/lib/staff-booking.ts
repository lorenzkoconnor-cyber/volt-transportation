// ─── Staff bookings: create, edit, refund the difference (server-only) ─────────
// Used by the Team Portal (owner, manager, office staff). Everything is priced
// and validated here from the raw choices — the browser's numbers are only a
// preview (see src/lib/staff-pricing.ts for the shared math).
//
// Edits:
//   • Who may edit when: editAccess() in staff-pricing.ts — inside 24 h of the
//     outbound only owners/managers; after it leaves, only the return leg until
//     2 h before the return departure.
//   • A change that costs more must be PAID before it is applied. Cash is
//     recorded and applied at once; a card (or a split) parks the change as
//     "awaiting_payment" with a pending card payment row, and the change is
//     applied once that card is charged (by the browser, or by the Stripe
//     webhook if the browser never comes back).
//   • A change that costs less is applied right away; the customer is then owed
//     a refund, which staff issue separately with refundDifference().
//   • Every change is recorded in reservation_changes with who made it.

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import {
  buildFlightRows, createAdminDb, findCustomer, isSimulatedPaymentId, normalizePayload, type CheckoutPayload,
} from "@/lib/checkout";
import { generateConfirmationNumber } from "@/lib/booking";
import { codeDiscountCents, codeState, formatCode, normalizeCode, CODE_ERRORS } from "@/lib/discount-codes";
import {
  easternInstant, editAccess, reservationBalance, staffDiscountCents, staffDiscountLabel, staffSubtotalCents,
  type StaffDiscount, type StaffRates,
} from "@/lib/staff-pricing";
import { formatCents, formatDateShort, formatTime12h } from "@/lib/format";
import { loadMessageInfo, notifyConfirmation, notifyUpdated } from "@/lib/reservation-messages";
import { loadAppSettings } from "@/lib/settings-server";
import { snapshotFrom, snapshotPricing } from "@/lib/settings";
import { alertIfShortNotice } from "@/lib/notifications/alerts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const STAFF_ROLES = ["owner", "manager", "office_staff"];

export interface StaffContext {
  sb: Db;
  userId: string;
  employee: { id: string; role: string; name: string };
}

/** Signed-in owner / manager / office staff, or an error response. */
export async function requireStaff(): Promise<StaffContext | NextResponse> {
  const authed = await createServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = createAdminDb();
  const { data: employee } = await sb
    .from("employees")
    .select("id, role, first_name, last_name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!employee || !STAFF_ROLES.includes(employee.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return {
    sb,
    userId: user.id,
    employee: { id: employee.id, role: employee.role, name: `${employee.first_name} ${employee.last_name}`.trim() },
  };
}

// ── Input ─────────────────────────────────────────────────────────────────────
export interface StaffInput {
  payload: CheckoutPayload;
  customer: { firstName: string; lastName: string; phone: string; email: string };
  discount: StaffDiscount;
  termsAgreed: boolean;
}

export type PayMethod = "cash" | "stripe" | "split" | "comp";
export interface StaffPayment {
  method: PayMethod;
  collectNow: boolean;      // cash received / card charged on this screen
  splitCashCents: number;   // split only
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function normalizeDiscount(d: any): StaffDiscount {
  if (d?.kind === "military") return { kind: "military" };
  if (d?.kind === "code" && normalizeCode(d.code)) {
    return { kind: "code", code: normalizeCode(d.code), type: d.type === "percent" ? "percent" : "fixed", value: Number(d.value) || 0 };
  }
  if (d?.kind === "manual" && Number(d.value) > 0) {
    return { kind: "manual", type: d.type === "percent" ? "percent" : "amount", value: Math.max(0, Number(d.value)) };
  }
  return { kind: "none" };
}

export function normalizeStaffInput(body: any): StaffInput | { error: string } {
  const c = body?.customer ?? {};
  const customer = {
    firstName: str(c.firstName, 60),
    lastName: str(c.lastName, 60),
    phone: str(c.phone, 30),
    email: str(c.email, 200).toLowerCase(),
  };
  if (!customer.firstName || !customer.lastName) return { error: "Enter the customer's first and last name." };
  if (customer.phone.replace(/\D/g, "").length < 10) return { error: "Enter a 10-digit phone number." };
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return { error: "That email address doesn't look right." };

  const payload = normalizePayload({
    ...body,
    primaryPassenger: { name: `${customer.firstName} ${customer.lastName}`, phone: customer.phone, email: customer.email },
  });
  if (!payload) return { error: "Pick a departure." };
  if (body?.isRoundTrip && !payload.returnTripId) return { error: "Pick a return departure for the round trip." };
  return { payload, customer, discount: normalizeDiscount(body?.discount), termsAgreed: !!body?.termsAgreed };
}

export function normalizePayment(p: any): StaffPayment {
  const method: PayMethod = ["cash", "stripe", "split", "comp"].includes(p?.method) ? p.method : "cash";
  return {
    method,
    collectNow: p?.collectNow !== false,
    splitCashCents: Math.max(0, Math.round(Number(p?.splitCashCents) || 0)),
  };
}

// ── Trips ─────────────────────────────────────────────────────────────────────
const TRIP_FIELDS =
  "id, departure_date, departure_time, status, total_capacity, seats_booked, " +
  "route:routes(id, name, origin_key, destination_key, origin_label, destination_label, duration_minutes)";

interface LegTrips { out: any; ret: any | null }

async function loadLegTrips(sb: Db, payload: CheckoutPayload, allowedExisting: string[] = []): Promise<LegTrips | { error: string }> {
  const ids = [payload.tripId, payload.returnTripId].filter(Boolean);
  const { data: trips } = await sb.from("trips").select(TRIP_FIELDS).in("id", ids);
  const out = trips?.find((t: any) => t.id === payload.tripId);
  if (!out) return { error: "That departure no longer exists." };
  const usable = (t: any) => t.status === "scheduled" || allowedExisting.includes(t.id);
  if (!usable(out)) return { error: "That departure is no longer taking bookings." };
  const now = Date.now();
  const departs = (t: any) => easternInstant(t.departure_date, t.departure_time.slice(0, 5));
  if (departs(out) <= now && !allowedExisting.includes(out.id)) return { error: "That departure has already left." };

  let ret = null;
  if (payload.isRoundTrip) {
    ret = trips?.find((t: any) => t.id === payload.returnTripId);
    if (!ret || !usable(ret)) return { error: "That return departure is no longer taking bookings." };
    if (ret.route?.origin_key !== out.route?.destination_key) return { error: "The return trip must go the opposite way." };
    if (departs(ret) <= departs(out)) return { error: "The return departure must be after the outbound one." };
  }
  return { out, ret };
}

function legLabel(t: any): string {
  if (!t) return "—";
  return `${t.route?.origin_key === "atl" ? "ATL → Columbus" : "Columbus → ATL"}, ${formatDateShort(t.departure_date)} ${formatTime12h(t.departure_time)}`;
}

// Seats this reservation needs on each trip.
function seatNeeds(outId: string | null, retId: string | null, seats: number): Map<string, number> {
  const m = new Map<string, number>();
  if (outId) m.set(outId, (m.get(outId) ?? 0) + seats);
  if (retId) m.set(retId, (m.get(retId) ?? 0) + seats);
  return m;
}

/**
 * Moves a reservation's seats from `before` to `after` (trip → seats). Adds
 * first (each add fails if the trip is full) and only then releases, so a
 * failure leaves the original seats untouched.
 */
async function moveSeats(sb: Db, before: Map<string, number>, after: Map<string, number>): Promise<string | null> {
  const ids = new Set([...before.keys(), ...after.keys()]);
  const adds: [string, number][] = [];
  const releases: [string, number][] = [];
  for (const id of ids) {
    const diff = (after.get(id) ?? 0) - (before.get(id) ?? 0);
    if (diff > 0) adds.push([id, diff]);
    if (diff < 0) releases.push([id, -diff]);
  }
  const done: [string, number][] = [];
  for (const [id, n] of adds) {
    const { error } = await sb.rpc("increment_seats_booked", { p_trip_id: id, p_count: n });
    if (error) {
      for (const [d, k] of done) await sb.rpc("decrement_seats_booked", { p_trip_id: d, p_count: k });
      return "Not enough seats left on that departure.";
    }
    done.push([id, n]);
  }
  for (const [id, n] of releases) await sb.rpc("decrement_seats_booked", { p_trip_id: id, p_count: n });
  return null;
}

// Free seats on each trip, counting this reservation's own seats as free.
function seatShortfall(legs: LegTrips, needs: Map<string, number>, held: Map<string, number>): string | null {
  for (const t of [legs.out, legs.ret].filter(Boolean)) {
    const free = t.total_capacity - t.seats_booked + (held.get(t.id) ?? 0);
    const need = needs.get(t.id) ?? 0;
    if (need > free) return `Only ${Math.max(0, free)} seat${free === 1 ? "" : "s"} left on ${legLabel(t)}.`;
  }
  return null;
}

// ── Discounts ─────────────────────────────────────────────────────────────────
interface ResolvedDiscount {
  discountCents: number;
  codeRow: any | null;
  isMilitary: boolean;
  label: string;
}

async function resolveDiscount(
  sb: Db, d: StaffDiscount, subtotalCents: number, currentCodeId: string | null, rates: StaffRates,
): Promise<ResolvedDiscount | { error: string }> {
  if (d.kind === "code") {
    const { data: row } = await sb.from("discount_codes").select("*").eq("code", normalizeCode(d.code)).maybeSingle();
    if (!row) return { error: CODE_ERRORS.invalid };
    if (row.id !== currentCodeId) {
      const state = codeState(row);
      if (state !== "active") return { error: CODE_ERRORS[state] };
      if (row.reserved_until && new Date(row.reserved_until).getTime() > Date.now()) {
        return { error: "That code is being used in another checkout right now." };
      }
    }
    const terms = { type: row.discount_type, value: row.value } as const;
    return {
      discountCents: codeDiscountCents(subtotalCents, terms),
      codeRow: row,
      isMilitary: false,
      label: staffDiscountLabel({ kind: "code", code: formatCode(row.code), ...terms }),
    };
  }
  return {
    discountCents: staffDiscountCents(subtotalCents, d, rates),
    codeRow: null,
    isMilitary: d.kind === "military",
    label: staffDiscountLabel(d, rates),
  };
}

// Spend a code on a reservation (once ever). True if it's now ours.
async function spendCode(sb: Db, codeId: string, reservationId: string): Promise<boolean> {
  const { data } = await sb
    .from("discount_codes")
    .update({ used_at: new Date().toISOString(), used_reservation_id: reservationId })
    .eq("id", codeId)
    .or(`used_at.is.null,used_reservation_id.eq.${reservationId}`)
    .select("id");
  return !!data && data.length > 0;
}

async function logChange(sb: Db, row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await sb.from("reservation_changes").insert(row).select("id").single();
  if (error) console.error("[staff-booking] could not log change", error);
  return data?.id ?? null;
}

// Text + email the customer about their reservation. Never throws.
async function messageCustomer(sb: Db, reservationId: string, send: (info: any) => Promise<void>) {
  try {
    const info = await loadMessageInfo(sb, reservationId);
    if (info) await send(info);
  } catch (err) {
    console.error("[staff-booking] customer message failed", err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Create
// ═════════════════════════════════════════════════════════════════════════════
export async function createStaffReservation(
  ctx: StaffContext, input: StaffInput, payment: StaffPayment,
): Promise<{ id: string; confirmationNumber: string; cardPaymentId: string | null } | { error: string; status?: number }> {
  const { sb, employee } = ctx;
  const { payload } = input;
  if (!input.termsAgreed) return { error: "Confirm the customer agreed to the Terms & Conditions." };

  const legs = await loadLegTrips(sb, payload);
  if ("error" in legs) return legs;
  const seats = payload.adults + payload.children;
  const short = seatShortfall(legs, seatNeeds(legs.out.id, legs.ret?.id ?? null, seats), new Map());
  if (short) return { error: short };

  // New bookings use today's prices (Dashboard → Settings) and keep a copy.
  const settings = await loadAppSettings();
  if (input.discount.kind === "military" && !settings.military.enabled) {
    return { error: "The Military Discount is turned off in Settings." };
  }
  const rates: StaffRates = { pricing: settings.pricing, militaryAmount: settings.military.amount };
  const comp = payment.method === "comp";
  const subtotalCents = staffSubtotalCents(payload, rates);
  const discount = comp
    ? { discountCents: subtotalCents, codeRow: null, isMilitary: false, label: "Complimentary" }
    : await resolveDiscount(sb, input.discount, subtotalCents, null, rates);
  if ("error" in discount) return discount;
  const totalCents = subtotalCents - discount.discountCents;

  // Payment rows — a split is one cash row + one card row. Card rows start
  // pending and turn paid once the card is charged.
  const pay = payment.method;
  if (pay === "split" && (payment.splitCashCents <= 0 || payment.splitCashCents >= totalCents)) {
    return { error: "For a split payment, enter a cash amount between $0 and the total." };
  }
  const cardCents = pay === "split" ? totalCents - payment.splitCashCents : pay === "stripe" ? totalCents : 0;
  const chargeCardNow = cardCents > 0 && (pay === "split" || payment.collectNow);
  if (chargeCardNow && cardCents < 50) return { error: "Card charges must be at least $0.50 — take the rest in cash or mark it Comp." };
  const paymentRows =
    comp || totalCents === 0 ? [{ method: "comp", status: "paid", amount_cents: 0, notes: comp ? "Complimentary booking" : discount.label }]
    : pay === "split" ? [
        { method: "cash", status: "paid", amount_cents: payment.splitCashCents, notes: "Split payment — cash part" },
        { method: "stripe", status: "pending", amount_cents: cardCents, notes: "Split payment — card part" },
      ]
    : pay === "stripe" ? [{ method: "stripe", status: "pending", amount_cents: totalCents, notes: chargeCardNow ? null : "To be collected" }]
    : [{ method: "cash", status: payment.collectNow ? "paid" : "pending", amount_cents: totalCents, notes: payment.collectNow ? null : "To be collected" }];

  // Customer — reuse a matching record (same email + phone), else create one.
  const digits = input.customer.phone.replace(/\D/g, "");
  const email = input.customer.email || `${digits}@walkin.volt`;
  const lookup = { ...payload, primaryPassenger: { ...payload.primaryPassenger, email } };
  let customerId = (await findCustomer(sb, null, lookup))?.id ?? null;
  if (!customerId) {
    const { data: created, error } = await sb
      .from("customers")
      .insert({ first_name: input.customer.firstName, last_name: input.customer.lastName, phone: input.customer.phone, email, is_military: false })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not save the customer." };
    customerId = created.id;
  }

  // Seats (atomic — fails if the trip filled up meanwhile).
  const needs = seatNeeds(legs.out.id, legs.ret?.id ?? null, seats);
  const seatError = await moveSeats(sb, new Map(), needs);
  if (seatError) return { error: seatError };

  let reservationId: string | null = null;
  try {
    const confirmationNumber = generateConfirmationNumber();
    const { data: reservation, error: resErr } = await sb
      .from("reservations")
      .insert({
        confirmation_number: confirmationNumber,
        customer_id: customerId,
        trip_id: legs.out.id,
        return_trip_id: legs.ret?.id ?? null,
        status: "confirmed",
        adults: payload.adults,
        children: payload.children,
        pets: payload.pets,
        extra_bags: payload.extraBags,
        is_round_trip: payload.isRoundTrip,
        special_notes: payload.specialNotes || null,
        subtotal_cents: subtotalCents,
        discount_cents: discount.discountCents,
        total_cents: totalCents,
        is_military: discount.isMilitary,
        discount_code_id: discount.codeRow?.id ?? null,
        created_by_employee_id: employee.id,
        pricing_snapshot: snapshotFrom(settings),
        terms_acceptance: "verbal",
        terms_accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (resErr || !reservation) throw resErr ?? new Error("Reservation insert failed");
    reservationId = reservation.id;

    if (discount.codeRow && !(await spendCode(sb, discount.codeRow.id, reservation.id))) {
      throw new Error(CODE_ERRORS.used);
    }

    await writePassengers(sb, reservation.id, payload, []);
    const flightRows = buildFlightRows(reservation.id, payload);
    if (flightRows.length) {
      const { error } = await sb.from("reservation_flights").insert(flightRows);
      if (error) console.error("[staff-booking] flight details not saved", error);
    }

    const { data: payments, error: payErr } = await sb
      .from("payments")
      .insert(paymentRows.map((p) => ({ ...p, reservation_id: reservation.id, refund_amount_cents: 0 })))
      .select("id, method");
    if (payErr) throw payErr;

    await logChange(sb, {
      reservation_id: reservation.id,
      employee_id: employee.id,
      employee_name: employee.name,
      action: "created",
      summary: [
        `Booked by ${employee.name}`,
        "Customer agreed to the Terms & Conditions verbally",
        ...(discount.isMilitary ? ["Military Discount — ID checked in person"] : []),
        ...(discount.codeRow ? [`Discount code ${formatCode(discount.codeRow.code)}`] : []),
      ],
      new_data: { total_cents: totalCents, payment: pay },
      applied_at: new Date().toISOString(),
    });

    await messageCustomer(sb, reservation.id, (info) => notifyConfirmation(sb, info));
    await alertIfShortNotice(sb, reservation.id);

    const cardRow = chargeCardNow ? (payments ?? []).find((p: any) => p.method === "stripe") : null;
    return { id: reservation.id, confirmationNumber, cardPaymentId: cardRow?.id ?? null };
  } catch (err) {
    if (reservationId) {
      await sb.from("reservation_passengers").delete().eq("reservation_id", reservationId);
      await sb.from("reservation_flights").delete().eq("reservation_id", reservationId);
      await sb.from("reservation_changes").delete().eq("reservation_id", reservationId);
      await sb.from("payments").delete().eq("reservation_id", reservationId);
      if (discount.codeRow) {
        await sb.from("discount_codes").update({ used_at: null, used_reservation_id: null })
          .eq("id", discount.codeRow.id).eq("used_reservation_id", reservationId);
      }
      await sb.from("reservations").delete().eq("id", reservationId);
    }
    await moveSeats(sb, needs, new Map());
    return { error: err instanceof Error ? err.message : "Could not create the reservation.", status: 500 };
  }
}

// Primary passenger first. On an edit the existing lead row is kept (its id
// and boarding flags); the other names are replaced.
async function writePassengers(sb: Db, reservationId: string, payload: CheckoutPayload, existing: any[]) {
  const lead = existing.find((p) => p.is_primary);
  if (lead) {
    await sb.from("reservation_passengers").update({ name: payload.primaryPassenger.name }).eq("id", lead.id);
  }
  const others = existing.filter((p) => !p.is_primary);
  if (others.length) await sb.from("reservation_passengers").delete().in("id", others.map((p) => p.id));
  const rows = [
    ...(lead ? [] : [{ reservation_id: reservationId, name: payload.primaryPassenger.name, is_primary: true }]),
    ...payload.additionalPassengers.map((name) => ({ reservation_id: reservationId, name, is_primary: false })),
  ];
  if (rows.length) {
    const { error } = await sb.from("reservation_passengers").insert(rows);
    if (error) throw error;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Edit
// ═════════════════════════════════════════════════════════════════════════════
const EDIT_SELECT =
  "*, customer:customers(id, first_name, last_name, phone, email), " +
  `trip:trips!reservations_trip_id_fkey(${TRIP_FIELDS}), ` +
  `return_trip:trips!reservations_return_trip_id_fkey(${TRIP_FIELDS}), ` +
  "reservation_passengers(id, name, is_primary), " +
  "reservation_flights(leg, direction, airline, flight_number, terminal, flight_date, flight_time, trip_id), " +
  "payments(id, method, status, amount_cents, refund_amount_cents, stripe_payment_intent_id, reservation_change_id, created_at), " +
  "discount_code:discount_codes!reservations_discount_code_id_fkey(id, code, discount_type, value)";

export async function loadReservation(sb: Db, id: string): Promise<any | null> {
  const { data, error } = await sb.from("reservations").select(EDIT_SELECT).eq("id", id).maybeSingle();
  if (error) console.error("[staff-booking] load reservation", error);
  return data ?? null;
}

export interface EditPlan {
  summary: string[];
  oldTotalCents: number;
  newTotalCents: number;
  priceChangeCents: number;     // > 0 → customer pays more
  refundDueAfterCents: number;  // what they'd be owed back once applied
  // Internals for apply
  input: StaffInput;
  legs: LegTrips;
  subtotalCents: number;
  discount: ResolvedDiscount;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function flightKey(f: any): string {
  return [f.leg, f.airline, (f.flight_number ?? f.flightNumber ?? "").toUpperCase(), f.terminal, f.flight_date ?? f.date, (f.flight_time ?? f.time ?? "").slice(0, 5)].join("|");
}

export async function planEdit(sb: Db, resv: any, input: StaffInput, role: string): Promise<EditPlan | { error: string }> {
  const settings = await loadAppSettings();
  const access = editAccess(role, resv.status, resv.trip, resv.is_round_trip ? resv.return_trip : null, Date.now(), settings);
  if (!access.mode) return { error: access.reason ?? "This reservation can't be changed now." };

  const { payload, customer } = input;
  const current = [resv.trip_id, resv.return_trip_id].filter(Boolean);
  const legs = await loadLegTrips(sb, payload, current);
  if ("error" in legs) return legs;

  const oldSeats = (resv.adults ?? 0) + (resv.children ?? 0);
  const newSeats = payload.adults + payload.children;
  const held = seatNeeds(resv.trip_id, resv.is_round_trip ? resv.return_trip_id : null, oldSeats);
  const short = seatShortfall(legs, seatNeeds(legs.out.id, legs.ret?.id ?? null, newSeats), held);
  if (short) return { error: short };

  // An edit keeps the prices the booking was made at (a later price change
  // never re-prices an existing booking).
  const snap = snapshotPricing(resv.pricing_snapshot);
  const rates: StaffRates = { pricing: snap.pricing, militaryAmount: snap.militaryAmount };
  const subtotalCents = staffSubtotalCents(payload, rates);
  const discount = await resolveDiscount(sb, input.discount, subtotalCents, resv.discount_code_id ?? null, rates);
  if ("error" in discount) return discount;
  const newTotalCents = subtotalCents - discount.discountCents;
  const priceChangeCents = newTotalCents - resv.total_cents;

  // The outbound has left — only the return leg (plus contact details, names
  // and notes) can still change.
  if (access.mode === "return_only") {
    const outFlight = (rows: any[]) => rows.filter((f) => f.leg === "outbound").map(flightKey).join("~");
    const same =
      payload.tripId === resv.trip_id &&
      payload.isRoundTrip && !!payload.returnTripId &&
      payload.adults === resv.adults && payload.children === resv.children &&
      payload.pets === resv.pets && payload.extraBags === resv.extra_bags &&
      priceChangeCents === 0 &&
      outFlight(resv.reservation_flights ?? []) === outFlight(buildFlightRows("x", payload));
    if (!same) return { error: "The outbound trip has left — only the return trip can be changed now." };
  }

  // What changed, in plain words (shown to staff, kept in the history, texted).
  const s: string[] = [];
  const oldOut = resv.trip;
  const oldRet = resv.is_round_trip ? resv.return_trip : null;
  if (oldOut?.route?.origin_key !== legs.out.route?.origin_key) {
    s.push(`Direction: now ${legs.out.route?.origin_key === "atl" ? "ATL → Columbus" : "Columbus → ATL"}`);
  }
  if (oldOut?.id !== legs.out.id) s.push(`Departure: ${legLabel(oldOut)} → ${legLabel(legs.out)}`);
  if (!oldRet && legs.ret) s.push(`Round trip added — return ${legLabel(legs.ret)}`);
  else if (oldRet && !legs.ret) s.push("Changed to one-way (return removed)");
  else if (oldRet && legs.ret && oldRet.id !== legs.ret.id) s.push(`Return: ${legLabel(oldRet)} → ${legLabel(legs.ret)}`);
  const counts: [string, number, number, string, string?][] = [
    ["adults", resv.adults, payload.adults, "adult"],
    ["children", resv.children, payload.children, "child", "children"],
    ["pets", resv.pets, payload.pets, "pet"],
    ["extra_bags", resv.extra_bags, payload.extraBags, "extra bag"],
  ];
  for (const [, before, after, one, many] of counts) {
    if ((before ?? 0) !== after) s.push(`${plural(before ?? 0, one, many)} → ${plural(after, one, many)}`);
  }
  const oldName = `${resv.customer?.first_name ?? ""} ${resv.customer?.last_name ?? ""}`.trim();
  if (oldName !== `${customer.firstName} ${customer.lastName}`) s.push(`Name: ${oldName} → ${customer.firstName} ${customer.lastName}`);
  if ((resv.customer?.phone ?? "").replace(/\D/g, "") !== customer.phone.replace(/\D/g, "")) s.push(`Phone: ${customer.phone}`);
  const oldEmail = (resv.customer?.email ?? "").endsWith("@walkin.volt") ? "" : resv.customer?.email ?? "";
  if (customer.email && customer.email !== oldEmail.toLowerCase()) s.push(`Email: ${customer.email}`);
  const oldNames = (resv.reservation_passengers ?? []).filter((p: any) => !p.is_primary).map((p: any) => p.name).sort().join("|");
  if (oldNames !== [...payload.additionalPassengers].sort().join("|")) s.push("Passenger names updated");
  const newFlights = buildFlightRows("x", payload);
  const fk = (rows: any[]) => rows.map(flightKey).sort().join("~");
  if (fk(resv.reservation_flights ?? []) !== fk(newFlights)) {
    s.push(newFlights.length ? "Flight details updated" : "Flight details removed");
  }
  if ((resv.special_notes ?? "") !== payload.specialNotes) s.push("Notes updated");
  const oldDiscountKey = resv.discount_code_id ? `code:${resv.discount_code_id}` : resv.is_military ? "military" : `cents:${resv.discount_cents}`;
  const newDiscountKey = discount.codeRow ? `code:${discount.codeRow.id}` : discount.isMilitary ? "military" : `cents:${discount.discountCents}`;
  if (oldDiscountKey !== newDiscountKey) {
    s.push(discount.discountCents > 0 ? `Discount: ${discount.label || "custom"} (−${formatCents(discount.discountCents)})` : "Discount removed");
  }
  if (priceChangeCents !== 0) s.push(`Price: ${formatCents(resv.total_cents)} → ${formatCents(newTotalCents)}`);

  const balance = reservationBalance(newTotalCents, resv.payments ?? []);
  return {
    summary: s,
    oldTotalCents: resv.total_cents,
    newTotalCents,
    priceChangeCents,
    refundDueAfterCents: priceChangeCents < 0 ? Math.max(0, balance.collectedCents - newTotalCents) : 0,
    input,
    legs,
    subtotalCents,
    discount,
  };
}

// Abandon earlier unpaid edits on this reservation (their card was never
// charged), removing the pending card rows they created.
async function abandonUnpaidChanges(sb: Db, reservationId: string) {
  const { data: stale } = await sb
    .from("reservation_changes")
    .select("id")
    .eq("reservation_id", reservationId)
    .eq("status", "awaiting_payment");
  for (const c of stale ?? []) {
    await sb.from("payments").delete().eq("reservation_change_id", c.id).eq("status", "pending");
    await sb.from("reservation_changes").update({ status: "abandoned" }).eq("id", c.id).eq("status", "awaiting_payment");
  }
}

// Shrink "to be collected" rows when the price drops, so the customer isn't
// asked to pay for what they removed.
async function shrinkPending(sb: Db, resv: any, byCents: number) {
  let left = byCents;
  const pending = (resv.payments ?? []).filter((p: any) => p.status === "pending" && !p.reservation_change_id);
  for (const p of pending) {
    if (left <= 0) break;
    const take = Math.min(left, p.amount_cents);
    left -= take;
    if (take === p.amount_cents) await sb.from("payments").delete().eq("id", p.id);
    else await sb.from("payments").update({ amount_cents: p.amount_cents - take }).eq("id", p.id);
  }
}

export type ApplyResult =
  | { ok: true; applied: true; summary: string[]; refundDueCents: number }
  | { ok: true; applied: false; changeId: string; cardPaymentId: string; cardCents: number }
  | { ok: false; error: string; status?: number };

/**
 * Start (and, when no card is involved, finish) an edit. `payment` is only
 * used when the change costs more.
 */
export async function startEdit(ctx: StaffContext, resv: any, input: StaffInput, payment: StaffPayment): Promise<ApplyResult> {
  const { sb, employee } = ctx;
  await abandonUnpaidChanges(sb, resv.id);
  const fresh = await loadReservation(sb, resv.id);
  const plan = await planEdit(sb, fresh, input, employee.role);
  if ("error" in plan) return { ok: false, error: plan.error };
  if (plan.summary.length === 0) return { ok: false, error: "Nothing has changed." };

  const extra = plan.priceChangeCents;
  const base = {
    reservation_id: resv.id,
    employee_id: employee.id,
    employee_name: employee.name,
    action: "edited",
    summary: plan.summary,
    price_change_cents: extra,
    old_data: snapshot(fresh),
    new_data: { input: serializeInput(input), payment, role: employee.role },
  };

  if (extra <= 0) {
    const changeId = await logChange(sb, { ...base, status: "awaiting_payment" });
    if (!changeId) return { ok: false, error: "Could not record the change." };
    return finishEdit(sb, changeId, []);
  }

  // Costs more — collect the difference first.
  if (payment.method === "comp") return { ok: false, error: "Choose cash, card or split for the extra charge (or add a discount)." };
  if (payment.method === "cash") {
    const changeId = await logChange(sb, { ...base, status: "awaiting_payment" });
    if (!changeId) return { ok: false, error: "Could not record the change." };
    return finishEdit(sb, changeId, [{ method: "cash", status: "paid", amount_cents: extra, notes: "Reservation change — cash" }]);
  }
  const cashCents = payment.method === "split" ? payment.splitCashCents : 0;
  if (payment.method === "split" && (cashCents <= 0 || cashCents >= extra)) {
    return { ok: false, error: `For a split payment, enter a cash amount between $0 and ${formatCents(extra)}.` };
  }
  const cardCents = extra - cashCents;
  if (cardCents < 50) return { ok: false, error: "Card charges must be at least $0.50 — take it in cash instead." };

  const changeId = await logChange(sb, { ...base, status: "awaiting_payment" });
  if (!changeId) return { ok: false, error: "Could not record the change." };
  const { data: cardRow, error } = await sb
    .from("payments")
    .insert({
      reservation_id: resv.id,
      method: "stripe",
      status: "pending",
      amount_cents: cardCents,
      refund_amount_cents: 0,
      reservation_change_id: changeId,
      notes: cashCents ? "Reservation change — card part" : "Reservation change — card",
    })
    .select("id")
    .single();
  if (error || !cardRow) return { ok: false, error: error?.message ?? "Could not start the card payment." };
  return { ok: true, applied: false, changeId, cardPaymentId: cardRow.id, cardCents };
}

/**
 * Apply an edit whose extra charge (if any) is now paid. Safe to call twice —
 * from the browser after the card goes through and from the Stripe webhook.
 */
export async function finishEdit(sb: Db, changeId: string, cashRows: Record<string, unknown>[] | null = null): Promise<ApplyResult> {
  const { data: change } = await sb.from("reservation_changes").select("*").eq("id", changeId).maybeSingle();
  if (!change) return { ok: false, error: "Change not found.", status: 404 };
  if (change.status === "applied") {
    const r = await loadReservation(sb, change.reservation_id);
    return { ok: true, applied: true, summary: change.summary, refundDueCents: reservationBalance(r.total_cents, r.payments ?? []).refundDueCents };
  }
  if (change.status !== "awaiting_payment") return { ok: false, error: `This change was ${change.status}.` };

  // Claim it so the browser and the webhook can't both apply it.
  const { data: claimed } = await sb
    .from("reservation_changes")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", changeId)
    .eq("status", "awaiting_payment")
    .select("id");
  if (!claimed?.length) return finishEdit(sb, changeId, null);

  const fail = async (error: string) => {
    await sb.from("reservation_changes").update({ status: "failed", error, applied_at: null }).eq("id", changeId);
    return { ok: false as const, error };
  };

  const resv = await loadReservation(sb, change.reservation_id);
  const stored = change.new_data ?? {};
  const input = normalizeStaffInput(stored.input);
  if ("error" in input) return fail(input.error);
  const plan = await planEdit(sb, resv, input, String(stored.role ?? ""));
  if ("error" in plan) return fail(`${plan.error} Any extra payment taken now shows as a refund due.`);

  // Card part of the extra charge must be paid (and match what was quoted).
  const cardRows = (resv.payments ?? []).filter((p: any) => p.reservation_change_id === changeId);
  const cardPaid = cardRows.filter((p: any) => p.status === "paid").reduce((n: number, p: any) => n + p.amount_cents, 0);
  if (cardRows.some((p: any) => p.status !== "paid")) {
    await sb.from("reservation_changes").update({ status: "awaiting_payment", applied_at: null }).eq("id", changeId);
    return { ok: false, error: "The card hasn't been charged yet." };
  }
  // Split: record the cash part now that the card went through.
  const pay = stored.payment ?? {};
  const rows = cashRows ?? (pay.method === "split" && cardRows.length
    ? [{ method: "cash", status: "paid", amount_cents: Math.max(0, Math.round(Number(pay.splitCashCents) || 0)), notes: "Reservation change — cash part" }]
    : []);
  const cashPaid = rows.reduce((n, r: any) => n + (r.amount_cents as number), 0);
  if (plan.priceChangeCents > 0 && cardPaid + cashPaid !== plan.priceChangeCents) {
    if (rows.length) await sb.from("payments").insert(rows.map((r) => ({ ...r, reservation_id: resv.id, refund_amount_cents: 0, reservation_change_id: changeId })));
    return fail("The price changed while the card was being charged — nothing was updated. The amount taken shows as a refund due.");
  }

  // Seats first — the only step that can fail for lack of space.
  const oldSeats = (resv.adults ?? 0) + (resv.children ?? 0);
  const newSeats = input.payload.adults + input.payload.children;
  const seatError = await moveSeats(
    sb,
    seatNeeds(resv.trip_id, resv.is_round_trip ? resv.return_trip_id : null, oldSeats),
    seatNeeds(plan.legs.out.id, plan.legs.ret?.id ?? null, newSeats),
  );
  if (seatError) {
    if (rows.length) await sb.from("payments").insert(rows.map((r) => ({ ...r, reservation_id: resv.id, refund_amount_cents: 0, reservation_change_id: changeId })));
    return fail(`${seatError} Nothing was changed${cardPaid ? " — the card payment shows as a refund due" : ""}.`);
  }

  if (rows.length) {
    await sb.from("payments").insert(rows.map((r) => ({ ...r, reservation_id: resv.id, refund_amount_cents: 0, reservation_change_id: changeId })));
  }
  if (plan.priceChangeCents < 0) await shrinkPending(sb, resv, -plan.priceChangeCents);

  const { payload, customer } = input;
  const codeRow = plan.discount.codeRow;
  if (codeRow && codeRow.id !== resv.discount_code_id && !(await spendCode(sb, codeRow.id, resv.id))) {
    console.error(`[staff-booking] code ${codeRow.code} was spent elsewhere — honouring paid edit on ${resv.id}`);
  }

  const { error: updErr } = await sb
    .from("reservations")
    .update({
      trip_id: plan.legs.out.id,
      return_trip_id: plan.legs.ret?.id ?? null,
      is_round_trip: payload.isRoundTrip,
      adults: payload.adults,
      children: payload.children,
      pets: payload.pets,
      extra_bags: payload.extraBags,
      special_notes: payload.specialNotes || null,
      subtotal_cents: plan.subtotalCents,
      discount_cents: plan.discount.discountCents,
      total_cents: plan.newTotalCents,
      is_military: plan.discount.isMilitary,
      military_discount_pending: plan.discount.isMilitary ? resv.military_discount_pending : false,
      discount_code_id: codeRow?.id ?? null,
      updated_by_employee_id: change.employee_id,
    })
    .eq("id", resv.id);
  if (updErr) console.error("[staff-booking] reservation update failed", updErr);

  const custUpdate: Record<string, string> = {
    first_name: customer.firstName, last_name: customer.lastName, phone: customer.phone,
  };
  if (customer.email) custUpdate.email = customer.email;
  await sb.from("customers").update(custUpdate).eq("id", resv.customer_id);

  await writePassengers(sb, resv.id, payload, resv.reservation_passengers ?? []);
  await sb.from("reservation_flights").delete().eq("reservation_id", resv.id);
  const flightRows = buildFlightRows(resv.id, payload);
  if (flightRows.length) await sb.from("reservation_flights").insert(flightRows);

  // Release a code the edit removed (it was never "used" by anyone else).
  if (resv.discount_code_id && resv.discount_code_id !== codeRow?.id) {
    await sb.from("discount_codes").update({ used_at: null, used_reservation_id: null, used_checkout_id: null })
      .eq("id", resv.discount_code_id).eq("used_reservation_id", resv.id);
  }

  await messageCustomer(sb, resv.id, (info) =>
    notifyUpdated(sb, info, change.summary.filter((l: string) => !l.startsWith("Price:"))));

  const after = await loadReservation(sb, resv.id);
  return {
    ok: true,
    applied: true,
    summary: change.summary,
    refundDueCents: reservationBalance(after.total_cents, after.payments ?? []).refundDueCents,
  };
}

function serializeInput(input: StaffInput) {
  const p = input.payload;
  return {
    tripId: p.tripId, returnTripId: p.returnTripId, isRoundTrip: p.isRoundTrip,
    adults: p.adults, children: p.children, pets: p.pets, extraBags: p.extraBags,
    additionalPassengers: p.additionalPassengers, specialNotes: p.specialNotes, flights: p.flights,
    customer: input.customer, discount: input.discount, termsAgreed: input.termsAgreed,
  };
}

function snapshot(r: any) {
  return {
    trip_id: r.trip_id, return_trip_id: r.return_trip_id, is_round_trip: r.is_round_trip,
    adults: r.adults, children: r.children, pets: r.pets, extra_bags: r.extra_bags,
    subtotal_cents: r.subtotal_cents, discount_cents: r.discount_cents, total_cents: r.total_cents,
    special_notes: r.special_notes, discount_code_id: r.discount_code_id, is_military: r.is_military,
    customer: r.customer, passengers: (r.reservation_passengers ?? []).map((p: any) => p.name),
    flights: r.reservation_flights,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Refund the difference after an edit lowered the price
// ═════════════════════════════════════════════════════════════════════════════
export async function refundDifference(
  ctx: StaffContext, reservationId: string, amountCents: number | null,
): Promise<{ ok: true; refundedCents: number; lines: string[] } | { ok: false; error: string; status?: number }> {
  const { sb, employee, userId } = ctx;
  const resv = await loadReservation(sb, reservationId);
  if (!resv) return { ok: false, error: "Reservation not found.", status: 404 };
  const { refundDueCents } = reservationBalance(resv.total_cents, resv.payments ?? []);
  const amount = amountCents ?? refundDueCents;
  if (refundDueCents <= 0) return { ok: false, error: "Nothing is owed back on this reservation." };
  if (!Number.isInteger(amount) || amount <= 0 || amount > refundDueCents) {
    return { ok: false, error: `Refund must be between $0.01 and ${formatCents(refundDueCents)}.` };
  }

  // Give it back the way it was paid: the newest card payments first, then cash.
  const rank = (p: any) => (p.method === "stripe" ? 0 : p.method === "cash" ? 1 : 2);
  const candidates = (resv.payments ?? [])
    .filter((p: any) => p.status === "paid" && p.amount_cents - p.refund_amount_cents > 0)
    .sort((a: any, b: any) => rank(a) - rank(b) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  const stripe = getStripeServer();
  let left = amount;
  const lines: string[] = [];
  let refunded = 0;
  for (const p of candidates) {
    if (left <= 0) break;
    const take = Math.min(left, p.amount_cents - p.refund_amount_cents);
    const pi = p.stripe_payment_intent_id as string | null;
    const realCard = p.method === "stripe" && pi && pi.startsWith("pi_") && !isSimulatedPaymentId(pi);
    if (realCard) {
      if (!stripe) return { ok: false, error: "Stripe keys are not configured — can't refund a card." };
      try {
        await stripe.refunds.create(
          // The webhook must not treat this as a cancellation (see charge.refunded).
          { payment_intent: pi, amount: take, metadata: { reason: "reservation_edit", reservation_id: resv.id } },
          { idempotencyKey: `volt-edit-refund-${p.id}-${p.refund_amount_cents}-${take}` },
        );
      } catch (err) {
        if (refunded === 0) return { ok: false, error: err instanceof Error ? err.message : "Card refund failed." };
        lines.push(`Card refund of ${formatCents(take)} failed — try again.`);
        break;
      }
    }
    const total = p.refund_amount_cents + take;
    await sb.from("payments").update({
      refund_amount_cents: total,
      status: total >= p.amount_cents ? "refunded" : "paid",
      refunded_at: new Date().toISOString(),
      refunded_by_employee_id: employee.id,
    }).eq("id", p.id);
    lines.push(p.method === "stripe" ? `${formatCents(take)} refunded to the card` : p.method === "cash" ? `${formatCents(take)} cash handed back` : `${formatCents(take)} refunded`);
    refunded += take;
    left -= take;
  }
  if (refunded === 0) return { ok: false, error: "No payment on this reservation can be refunded." };

  await logChange(sb, {
    reservation_id: resv.id,
    employee_id: employee.id,
    employee_name: employee.name,
    action: "refund",
    summary: lines,
    amount_cents: refunded,
    applied_at: new Date().toISOString(),
  });
  await sb.from("audit_logs").insert({
    actor_id: userId,
    actor_role: employee.role,
    action: "reservation.edit_refund",
    table_name: "reservations",
    record_id: resv.id,
    new_data: { refund_cents: refunded, lines },
  });
  return { ok: true, refundedCents: refunded, lines };
}
