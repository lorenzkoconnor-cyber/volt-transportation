// ─── Ride-alongs (server-only) ────────────────────────────────────────────────
// Someone sees the van (say, at the airport) and wants a ride without a
// reservation:
//   1. A driver or office staff opens Ride-Along in the Team Portal and picks
//      the departing trip → createRideAlong() makes a QR code (30 minutes).
//   2. The rider scans it → /ride/<token>: party size, bags, name + phone, an
//      optional tip, card / Apple Pay / Google Pay.
//   3. startRideAlongCheckout() prices it like an online one-way booking and
//      makes a booking_checkouts row (ride_along_id) + PaymentIntent; the
//      usual finalizeCheckout() turns the payment into a reservation
//      (is_ride_along) — from the browser or the Stripe webhook.
// No online booking cutoff applies: staff opened the QR for this van.

import { createAdminDb, normalizePayload, priceCheckout } from "@/lib/checkout";
import { getStripeServer } from "@/lib/stripe/server";
import { loadAppSettings } from "@/lib/settings-server";
import { snapshotFrom } from "@/lib/settings";
import { easternInstant } from "@/lib/staff-pricing";
import { LOCATIONS } from "@/lib/booking";
import { appUrl } from "@/lib/reservation-messages";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const RIDE_ALONG_MINUTES = 30;
// Trips staff can open a QR for: not yet left (scheduled / boarding), departing
// from 45 minutes ago (a van running late) to 12 hours from now.
const LATE_GRACE_MS = 45 * 60_000;
const AHEAD_MS = 12 * 3_600_000;
const BOOKABLE = ["scheduled", "boarding"];
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

const TRIP_FIELDS =
  "id, departure_date, departure_time, status, total_capacity, seats_booked, " +
  "route:routes(origin_key, destination_key, origin_label, destination_label)";

export function rideAlongUrl(token: string): string {
  return `${appUrl()}/ride/${token}`;
}

const departsAt = (t: any) => easternInstant(t.departure_date, String(t.departure_time).slice(0, 5));

function tripOpen(t: any, now = Date.now()): boolean {
  if (!t || !BOOKABLE.includes(t.status)) return false;
  const at = departsAt(t);
  return at > now - LATE_GRACE_MS && at < now + AHEAD_MS;
}

export interface RideAlongTrip {
  id: string;
  date: string;
  time: string;          // HH:MM:SS (Eastern)
  from: string;          // "ATL"
  to: string;            // "Columbus"
  seatsLeft: number;
  status: string;
}

function tripView(t: any): RideAlongTrip {
  const r = t.route ?? {};
  return {
    id: t.id,
    date: t.departure_date,
    time: t.departure_time,
    from: LOCATIONS[r.origin_key as keyof typeof LOCATIONS]?.short ?? r.origin_label ?? "",
    to: LOCATIONS[r.destination_key as keyof typeof LOCATIONS]?.short ?? r.destination_label ?? "",
    seatsLeft: Math.max(0, t.total_capacity - t.seats_booked),
    status: t.status,
  };
}

/** Trips a QR can be opened for right now, soonest first. */
export async function rideAlongTrips(sb: Db): Promise<RideAlongTrip[]> {
  const now = Date.now();
  const from = new Date(now - LATE_GRACE_MS - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now + AHEAD_MS + 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("trips")
    .select(TRIP_FIELDS)
    .gte("departure_date", from)
    .lte("departure_date", to)
    .in("status", BOOKABLE)
    .order("departure_date")
    .order("departure_time");
  return (data ?? []).filter((t: any) => tripOpen(t, now)).map(tripView);
}

// ── Staff ─────────────────────────────────────────────────────────────────────
export async function createRideAlong(sb: Db, employeeId: string, tripId: string) {
  if (!TOKEN_RE.test(tripId)) return { error: "Pick a trip." };
  const { data: trip } = await sb.from("trips").select(TRIP_FIELDS).eq("id", tripId).maybeSingle();
  if (!tripOpen(trip)) return { error: "That trip isn't taking ride-alongs (it has left, or isn't within the next 12 hours)." };
  const { data: session, error } = await sb
    .from("ride_along_sessions")
    .insert({
      trip_id: tripId,
      created_by_employee_id: employeeId,
      expires_at: new Date(Date.now() + RIDE_ALONG_MINUTES * 60_000).toISOString(),
    })
    .select("id, token, expires_at")
    .single();
  if (error || !session) return { error: error?.message ?? "Could not start the ride-along." };
  return { id: session.id, url: rideAlongUrl(session.token), expiresAt: session.expires_at, trip: tripView(trip) };
}

/** What the staff screen shows while the QR is up: who has paid so far. */
export async function rideAlongStatus(sb: Db, id: string) {
  if (!TOKEN_RE.test(id)) return null;
  const { data: session } = await sb
    .from("ride_along_sessions")
    .select("id, token, status, expires_at, trip:trips(" + TRIP_FIELDS + ")")
    .eq("id", id)
    .maybeSingle();
  if (!session) return null;
  const { data: checkouts } = await sb
    .from("booking_checkouts")
    .select("confirmation_number, payload, reservation_id, updated_at")
    .eq("ride_along_id", id)
    .eq("status", "completed")
    .order("updated_at");
  return {
    id: session.id,
    url: rideAlongUrl(session.token),
    open: session.status === "open" && new Date(session.expires_at).getTime() > Date.now(),
    expiresAt: session.expires_at,
    trip: session.trip ? tripView(session.trip) : null,
    parties: (checkouts ?? []).map((c: any) => ({
      confirmationNumber: c.confirmation_number,
      reservationId: c.reservation_id,
      name: c.payload?.primaryPassenger?.name ?? "",
      riders: (c.payload?.adults ?? 0) + (c.payload?.children ?? 0),
      bags: c.payload?.extraBags ?? 0,
      pets: c.payload?.pets ?? 0,
    })),
  };
}

export async function closeRideAlong(sb: Db, id: string) {
  if (!TOKEN_RE.test(id)) return;
  await sb.from("ride_along_sessions").update({ status: "closed" }).eq("id", id);
}

// ── Rider ─────────────────────────────────────────────────────────────────────
async function openSession(sb: Db, token: string) {
  if (!TOKEN_RE.test(token)) return { error: "This QR code isn't valid." };
  const { data: session } = await sb
    .from("ride_along_sessions")
    .select("id, status, expires_at, trip:trips(" + TRIP_FIELDS + ")")
    .eq("token", token)
    .maybeSingle();
  if (!session) return { error: "This QR code isn't valid." };
  if (session.status !== "open" || new Date(session.expires_at).getTime() <= Date.now()) {
    return { error: "This QR code has expired. Ask your driver for a new one." };
  }
  if (!tripOpen(session.trip)) return { error: "This van is no longer taking riders. Ask your driver for help." };
  return { session };
}

export interface RideAlongPage {
  trip: RideAlongTrip;
  pricing: { adult: number; child: number; pet: number; extraBag: number };
  businessPhone: string;
}

export async function loadRideAlongPage(token: string): Promise<RideAlongPage | { error: string }> {
  const sb = createAdminDb();
  const found = await openSession(sb, token);
  if ("error" in found) return { error: found.error as string };
  const settings = await loadAppSettings();
  return { trip: tripView(found.session.trip), pricing: settings.pricing, businessPhone: settings.business.phone };
}

export type StartRideAlong =
  | { ok: true; checkoutId: string; clientSecret: string; paymentIntentId: string; amountCents: number; simulated: boolean }
  | { ok: false; error: string; status?: number };

export async function startRideAlongCheckout(token: string, body: any): Promise<StartRideAlong> {
  const sb = createAdminDb();
  const found = await openSession(sb, token);
  if ("error" in found) return { ok: false, error: found.error as string, status: 410 };
  const { session } = found;
  const trip = session.trip;
  if (!body?.termsAgreed) return { ok: false, error: "Please agree to the Terms & Conditions." };

  const p = body?.primaryPassenger ?? {};
  if (String(p.phone ?? "").replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a 10-digit phone number." };
  const payload = normalizePayload({
    tripId: trip.id,
    returnTripId: null,
    isRoundTrip: false,
    adults: body?.adults,
    children: body?.children,
    pets: body?.pets,
    extraBags: body?.extraBags,
    primaryPassenger: p,
    additionalPassengers: [],
    specialNotes: body?.specialNotes ?? "",
    flights: [],
    smsConsent: body?.smsConsent === true,
    tipCents: body?.tipCents,
  });
  if (!payload) return { ok: false, error: "Enter your name and phone number." };
  const seats = payload.adults + payload.children;
  if (trip.total_capacity - trip.seats_booked < seats) {
    return { ok: false, error: `Sorry — this van only has ${Math.max(0, trip.total_capacity - trip.seats_booked)} seat(s) left.` };
  }

  const settings = await loadAppSettings();
  const price = priceCheckout(payload, false, null, null, settings);
  if ("error" in price) return { ok: false, error: price.error };
  if (price.totalCents < 50) return { ok: false, error: "Invalid amount." };

  const { data: checkout, error } = await sb
    .from("booking_checkouts")
    .insert({
      payload,
      subtotal_cents: price.subtotalCents,
      discount_cents: 0,
      tip_cents: price.tipCents,
      total_cents: price.totalCents,
      capture_method: "automatic",
      is_military: false,
      military_discount_pending: false,
      pricing_snapshot: snapshotFrom(settings),
      ride_along_id: session.id,
    })
    .select("id")
    .single();
  if (error || !checkout) throw error ?? new Error("Could not start checkout");

  const base = { checkoutId: checkout.id, amountCents: price.totalCents };
  const stripe = getStripeServer();
  if (!stripe) {
    const fakeId = `pi_simulated_${Date.now()}`;
    await sb.from("booking_checkouts").update({ stripe_payment_intent_id: fakeId }).eq("id", checkout.id);
    return { ok: true, ...base, clientSecret: "", paymentIntentId: fakeId, simulated: true };
  }
  const view = tripView(trip);
  const pi = await stripe.paymentIntents.create(
    {
      amount: price.totalCents,
      currency: "usd",
      capture_method: "automatic",
      payment_method_types: ["card"],
      receipt_email: payload.primaryPassenger.email || undefined,
      description: `Volt Transportation — ride-along ${view.from} → ${view.to}`,
      metadata: {
        platform: "volt_transportation",
        checkout_id: checkout.id,
        ride_along_id: session.id,
        customer_name: payload.primaryPassenger.name,
        customer_phone: payload.primaryPassenger.phone,
        trip_date: trip.departure_date,
        trip_time: trip.departure_time,
        tip_cents: String(price.tipCents),
      },
    },
    { idempotencyKey: `volt-checkout-${checkout.id}` },
  );
  await sb.from("booking_checkouts").update({ stripe_payment_intent_id: pi.id }).eq("id", checkout.id);
  return { ok: true, ...base, clientSecret: pi.client_secret ?? "", paymentIntentId: pi.id, simulated: false };
}
