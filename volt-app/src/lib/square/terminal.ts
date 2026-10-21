// ─── Square Terminal checkouts (server-only) ──────────────────────────────────
// Staff send a pending payment to the counter Terminal; the customer taps;
// Volt marks the payment paid. Used by /api/payments/square-terminal (start /
// status / cancel, polled by the dashboard) and /api/payments/square-webhook
// (Square's terminal.checkout.updated) — whichever sees COMPLETED first wins,
// and settling twice is harmless.

import { finishEdit } from "@/lib/staff-booking";
import { formatCode } from "@/lib/discount-codes";
import { formatDateShort, formatTime12h } from "@/lib/format";
import { LOCATIONS } from "@/lib/booking";
import { snapshotPricing } from "@/lib/settings";
import { buildSquareOrder, type OrderReservation } from "@/lib/square/orders";
import {
  SIMULATED_DEVICE, cancelTerminalCheckout, createSquareOrder, createTerminalCheckout, getTerminalCheckout,
  isSquareConfigured, usd, type CheckoutState, type CheckoutStatus,
} from "@/lib/square/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

// Square's smallest card payment.
export const SQUARE_MIN_CENTS = 100;

const LEG_FIELDS = "departure_date, departure_time, route:routes(origin_key, destination_key, origin_label, destination_label)";
const PAYMENT_SELECT =
  "id, method, status, amount_cents, reservation_change_id, stripe_payment_intent_id, " +
  "square_order_id, square_checkout_id, square_payment_id, " +
  "reservation:reservations(id, confirmation_number, status, adults, children, pets, extra_bags, is_round_trip, " +
  "subtotal_cents, discount_cents, total_cents, tip_cents, pickup_fee_cents, dropoff_fee_cents, is_military, pricing_snapshot, " +
  `trip:trips!reservations_trip_id_fkey(${LEG_FIELDS}), return_trip:trips!reservations_return_trip_id_fkey(${LEG_FIELDS}), ` +
  "discount_code:discount_codes!reservations_discount_code_id_fkey(code))";

export interface TerminalResult {
  status: CheckoutStatus | "PAID";
  paid: boolean;
  message?: string;
}
type Fail = { error: string; status?: number };

async function loadPayment(sb: Db, paymentId: string): Promise<any | null> {
  const { data } = await sb.from("payments").select(PAYMENT_SELECT).eq("id", paymentId).maybeSingle();
  return data;
}

/** Paired Terminals staff can send to (the simulated one when Square isn't set up). */
export async function listTerminals(sb: Db): Promise<{ id: string; name: string }[]> {
  if (!isSquareConfigured()) return [{ id: SIMULATED_DEVICE.id, name: SIMULATED_DEVICE.name }];
  const { data } = await sb.from("square_devices").select("id, name").eq("is_active", true).order("name");
  return data ?? [];
}

async function resolveDevice(sb: Db, id: string): Promise<string | null> {
  if (!isSquareConfigured()) return id === SIMULATED_DEVICE.id ? SIMULATED_DEVICE.device_id : null;
  const { data } = await sb.from("square_devices").select("device_id").eq("id", id).eq("is_active", true).maybeSingle();
  return data?.device_id ?? null;
}

function legLabel(t: any): string {
  if (!t) return "";
  const r = t.route ?? {};
  const from = LOCATIONS[r.origin_key as keyof typeof LOCATIONS]?.short ?? r.origin_label ?? "";
  const to = LOCATIONS[r.destination_key as keyof typeof LOCATIONS]?.short ?? r.destination_label ?? "";
  return `${from} → ${to} · ${formatDateShort(t.departure_date)}, ${formatTime12h(t.departure_time)}`;
}

async function buildOrderFor(sb: Db, p: any) {
  const r = p.reservation;
  const { pricing } = snapshotPricing(r.pricing_snapshot);
  const orderResv: OrderReservation = {
    confirmationNumber: r.confirmation_number,
    adults: r.adults ?? 0,
    children: r.children ?? 0,
    pets: r.pets ?? 0,
    extraBags: r.extra_bags ?? 0,
    isRoundTrip: !!r.is_round_trip,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents ?? 0,
    pickupFeeCents: r.pickup_fee_cents ?? 0,
    dropoffFeeCents: r.dropoff_fee_cents ?? 0,
    tipCents: r.tip_cents ?? 0,
    totalCents: r.total_cents,
    discountLabel: r.is_military ? "Military Discount"
      : r.discount_code?.code ? `Discount code ${formatCode(r.discount_code.code)}`
      : r.discount_cents > 0 ? "Discount" : null,
    pricing,
    outboundLabel: legLabel(r.trip),
    returnLabel: r.is_round_trip ? legLabel(r.return_trip) : null,
  };

  let change: { priceChangeCents: number; summary: string[] } | null = null;
  let paidElsewhereLabel = "Paid separately";
  if (p.reservation_change_id) {
    const { data: c } = await sb.from("reservation_changes")
      .select("price_change_cents, summary, new_data").eq("id", p.reservation_change_id).maybeSingle();
    if (!c) return { ok: false as const, error: "That reservation change no longer exists." };
    change = { priceChangeCents: c.price_change_cents ?? 0, summary: c.summary ?? [] };
    if (c.new_data?.payment?.method === "split") paidElsewhereLabel = "Paid in cash";
  } else {
    const { data: others } = await sb.from("payments")
      .select("method, status").eq("reservation_id", r.id).neq("id", p.id).in("status", ["paid", "pending"]);
    if ((others ?? []).length && others.every((o: any) => o.method === "cash")) paidElsewhereLabel = "Paid in cash";
  }
  return buildSquareOrder(orderResv, { amountCents: p.amount_cents, change, paidElsewhereLabel });
}

/** Mark a Square payment paid (idempotent) and apply an edit it was paying for. */
async function settle(sb: Db, p: { id: string; reservation_change_id: string | null }, squarePaymentId: string | null) {
  await sb.from("payments")
    .update({ status: "paid", captured_at: new Date().toISOString(), square_payment_id: squarePaymentId })
    .eq("id", p.id)
    .eq("status", "pending");
  if (p.reservation_change_id) {
    const applied = await finishEdit(sb, p.reservation_change_id);
    if (!applied.ok) console.warn(`[square] edit ${p.reservation_change_id} not applied: ${applied.error}`);
  }
}

async function apply(sb: Db, p: any, state: CheckoutState): Promise<TerminalResult> {
  if (state.status === "COMPLETED") {
    await settle(sb, p, state.paymentId);
    return { status: "PAID", paid: true };
  }
  if (state.status === "CANCELED") {
    await sb.from("payments").update({ square_checkout_id: null }).eq("id", p.id).eq("square_checkout_id", state.id);
    return { status: "CANCELED", paid: false, message: cancelMessage(state.cancelReason) };
  }
  return { status: state.status, paid: false };
}

function cancelMessage(reason: string | null): string {
  switch (reason) {
    case "BUYER_CANCELED": return "The customer cancelled on the Terminal.";
    case "TIMED_OUT": return "The Terminal timed out waiting for a card.";
    case "SELLER_CANCELED": return "Cancelled.";
    default: return "The Terminal payment didn't go through.";
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
export async function startTerminalCheckout(sb: Db, paymentId: string, deviceRowId: string): Promise<TerminalResult | Fail> {
  const p = await loadPayment(sb, paymentId);
  if (!p || !p.reservation) return { error: "Payment not found.", status: 404 };
  if (p.status === "paid") return { status: "PAID", paid: true };
  if (p.status !== "pending") return { error: `This payment is ${p.status}.` };
  if (!["square", "stripe", "cash"].includes(p.method)) return { error: "This payment can't be taken on the Terminal." };
  if (p.reservation.status === "cancelled") return { error: "This reservation is cancelled." };
  if (p.amount_cents < SQUARE_MIN_CENTS) return { error: "Square card payments must be at least $1.00 — take it in cash." };
  if (p.amount_cents > p.reservation.total_cents && !p.reservation_change_id) return { error: "Invalid amount." };

  // Already on a Terminal? Report it rather than sending twice.
  if (p.square_checkout_id) {
    const current = await apply(sb, p, await getTerminalCheckout(p.square_checkout_id));
    if (current.status !== "CANCELED") return current;
  }

  const deviceId = await resolveDevice(sb, deviceRowId);
  if (!deviceId) return { error: "Pick a paired Square Terminal (Settings → Payments)." };

  const built = await buildOrderFor(sb, p);
  if (!built.ok) return { error: built.error };

  const r = p.reservation;
  const order = await createSquareOrder({
    referenceId: r.confirmation_number,
    note: p.id,
    lineItems: built.lines.map((l) => ({
      name: l.name,
      quantity: String(l.quantity),
      base_price_money: usd(l.unitCents),
      ...(l.variation ? { variation_name: l.variation } : {}),
      ...(l.note ? { note: l.note } : {}),
    })),
    discounts: built.discounts.map((d, i) => ({
      uid: `d${i}`, name: d.name, type: "FIXED_AMOUNT" as const, amount_money: usd(d.cents), scope: "ORDER" as const,
    })),
  }, `volt-sq-order-${p.id}-${p.amount_cents}`);
  if (order.totalCents !== p.amount_cents) {
    return { error: `Square priced the cart at $${(order.totalCents / 100).toFixed(2)}, not $${(p.amount_cents / 100).toFixed(2)} — nothing was sent.` };
  }

  const checkout = await createTerminalCheckout({
    amountCents: p.amount_cents,
    orderId: order.id,
    deviceId,
    referenceId: p.id,
    note: `Volt ${r.confirmation_number}`,
  }, `volt-sq-co-${p.id}-${Date.now()}`);

  await sb.from("payments").update({
    method: "square",
    square_order_id: order.id,
    square_checkout_id: checkout.id,
  }).eq("id", p.id).eq("status", "pending");
  return { status: checkout.status, paid: false };
}

// ── Status (polled by the dashboard) ─────────────────────────────────────────
export async function terminalStatus(sb: Db, paymentId: string): Promise<TerminalResult | Fail> {
  const p = await loadPayment(sb, paymentId);
  if (!p) return { error: "Payment not found.", status: 404 };
  if (p.status === "paid") return { status: "PAID", paid: true };
  if (!p.square_checkout_id) return { status: "CANCELED", paid: false, message: "Not on a Terminal." };
  return apply(sb, p, await getTerminalCheckout(p.square_checkout_id));
}

// ── Cancel ────────────────────────────────────────────────────────────────────
export async function cancelTerminal(sb: Db, paymentId: string): Promise<TerminalResult | Fail> {
  const p = await loadPayment(sb, paymentId);
  if (!p) return { error: "Payment not found.", status: 404 };
  if (p.status === "paid") return { status: "PAID", paid: true };
  if (!p.square_checkout_id) return { status: "CANCELED", paid: false, message: "Cancelled." };
  let state: CheckoutState;
  try {
    state = await cancelTerminalCheckout(p.square_checkout_id);
  } catch {
    // Too late to cancel (e.g. the card was just tapped) — report what happened.
    state = await getTerminalCheckout(p.square_checkout_id);
  }
  // Square answers CANCEL_REQUESTED until the Terminal confirms; Volt treats
  // the request as the end of this attempt (a later COMPLETED still settles
  // through the webhook).
  if (state.status === "CANCEL_REQUESTED") state = { ...state, status: "CANCELED", cancelReason: "SELLER_CANCELED" };
  return apply(sb, p, state);
}

// ── Webhook ───────────────────────────────────────────────────────────────────
export async function onCheckoutUpdated(sb: Db, checkout: any): Promise<void> {
  if (!checkout?.id) return;
  const fields = "id, status, reservation_change_id, square_checkout_id";
  let { data: p } = await sb.from("payments").select(fields).eq("square_checkout_id", checkout.id).maybeSingle();
  // An earlier attempt (since replaced or cancelled) can still complete —
  // the checkout's reference_id is the Volt payment id.
  if (!p && checkout.status === "COMPLETED" && /^[0-9a-f-]{36}$/i.test(checkout.reference_id ?? "")) {
    ({ data: p } = await sb.from("payments").select(fields).eq("id", checkout.reference_id).eq("method", "square").maybeSingle());
    if (p) console.warn(`[square] checkout ${checkout.id} completed after it was replaced — settling payment ${p.id}`);
  }
  if (!p || p.status !== "pending") return;
  await apply(sb, p, {
    id: checkout.id, status: checkout.status, paymentId: checkout.payment_ids?.[0] ?? null, cancelReason: checkout.cancel_reason ?? null,
  });
}
