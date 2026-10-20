// ─── Square (server-only) ──────────────────────────────────────────────────────
// Walk-in card payments on the counter Square Terminal. Talks to Square's REST
// API directly (no SDK). Online bookings and phone cards stay on Stripe.
//
// Without real Square keys everything runs in SIMULATED mode: orders and
// checkouts get "sq_sim_" ids and a simulated checkout "completes" a few
// seconds after it is sent, so the whole flow can be tried without hardware.
//
// Env:
//   SQUARE_ENVIRONMENT            sandbox | production   (default sandbox)
//   SQUARE_ACCESS_TOKEN           Developer Dashboard → your app → Credentials
//   SQUARE_LOCATION_ID            Developer Dashboard → Locations
//   SQUARE_WEBHOOK_SIGNATURE_KEY  Developer Dashboard → Webhooks → your subscription
//   SQUARE_WEBHOOK_URL            optional; defaults to NEXT_PUBLIC_APP_URL + /api/payments/square-webhook
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SQUARE_VERSION = "2025-01-23";
const SIM_PREFIX = "sq_sim_";
// How long a simulated Terminal "waits for the tap" before completing.
const SIM_TAP_MS = 4000;

export function isSquareConfigured(): boolean {
  const token = process.env.SQUARE_ACCESS_TOKEN ?? "";
  const location = process.env.SQUARE_LOCATION_ID ?? "";
  return token.length > 20 && !token.includes("placeholder") && location.length > 3 && !location.includes("placeholder");
}

export function squareEnvironment(): "sandbox" | "production" {
  return process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function isSimulatedSquareId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(SIM_PREFIX);
}

/** The pseudo-device staff see when Square isn't configured. */
export const SIMULATED_DEVICE = { id: "simulated", name: "Simulated Terminal", device_id: `${SIM_PREFIX}device` };

export interface Money { amount: number; currency: "USD" }
export const usd = (cents: number): Money => ({ amount: cents, currency: "USD" });

export class SquareError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function squareFetch(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const base = squareEnvironment() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  const res = await fetch(`${base}/v2${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.errors?.[0];
    throw new SquareError(e?.detail ?? e?.code ?? `Square request failed (${res.status}).`, res.status);
  }
  return data;
}

// Square idempotency keys are limited to 45 characters (orders: 192).
const key45 = (k: string) => (k.length <= 45 ? k : createHmac("sha256", "volt").update(k).digest("hex").slice(0, 45));

// ── Orders ─────────────────────────────────────────────────────────────────────
export interface SquareLineItem {
  name: string;
  quantity: string;
  base_price_money: Money;
  variation_name?: string;
  note?: string;
}
export interface SquareDiscount {
  uid: string;
  name: string;
  type: "FIXED_AMOUNT";
  amount_money: Money;
  scope: "ORDER";
}

export async function createSquareOrder(
  o: { referenceId: string; lineItems: SquareLineItem[]; discounts: SquareDiscount[]; note?: string },
  idempotencyKey: string,
): Promise<{ id: string; totalCents: number }> {
  if (!isSquareConfigured()) {
    const total = o.lineItems.reduce((s, l) => s + l.base_price_money.amount * Number(l.quantity), 0)
      - o.discounts.reduce((s, d) => s + d.amount_money.amount, 0);
    return { id: `${SIM_PREFIX}order_${randomUUID()}`, totalCents: total };
  }
  const data = await squareFetch("/orders", {
    body: {
      idempotency_key: idempotencyKey.slice(0, 192),
      order: {
        location_id: process.env.SQUARE_LOCATION_ID,
        reference_id: o.referenceId.slice(0, 40),
        source: { name: "Volt Team Portal" },
        line_items: o.lineItems,
        discounts: o.discounts.length ? o.discounts : undefined,
        metadata: o.note ? { volt: o.note.slice(0, 255) } : undefined,
      },
    },
  });
  return { id: data.order.id, totalCents: Number(data.order.total_money?.amount ?? 0) };
}

// ── Terminal checkouts ─────────────────────────────────────────────────────────
export type CheckoutStatus = "PENDING" | "IN_PROGRESS" | "CANCEL_REQUESTED" | "CANCELED" | "COMPLETED";
export interface CheckoutState {
  id: string;
  status: CheckoutStatus;
  paymentId: string | null;
  cancelReason: string | null;
}

export async function createTerminalCheckout(
  c: { amountCents: number; orderId: string; deviceId: string; referenceId: string; note: string },
  idempotencyKey: string,
): Promise<CheckoutState> {
  if (!isSquareConfigured() || isSimulatedSquareId(c.deviceId)) {
    return { id: `${SIM_PREFIX}checkout_${Date.now()}_${randomUUID().slice(0, 8)}`, status: "PENDING", paymentId: null, cancelReason: null };
  }
  const data = await squareFetch("/terminals/checkouts", {
    body: {
      idempotency_key: key45(idempotencyKey),
      checkout: {
        amount_money: usd(c.amountCents),
        order_id: c.orderId,
        reference_id: c.referenceId.slice(0, 40),
        note: c.note.slice(0, 500),
        deadline_duration: "PT5M",
        device_options: {
          device_id: c.deviceId,
          show_itemized_cart: true,
          skip_receipt_screen: false,
          tip_settings: { allow_tipping: false },
        },
      },
    },
  });
  return toState(data.checkout);
}

export async function getTerminalCheckout(id: string): Promise<CheckoutState> {
  if (isSimulatedSquareId(id)) {
    const started = Number(id.split("_")[3]) || 0;
    const done = Date.now() - started >= SIM_TAP_MS;
    return {
      id,
      status: done ? "COMPLETED" : "IN_PROGRESS",
      paymentId: done ? `${SIM_PREFIX}payment_${id.split("_").slice(3).join("_")}` : null,
      cancelReason: null,
    };
  }
  const data = await squareFetch(`/terminals/checkouts/${encodeURIComponent(id)}`);
  return toState(data.checkout);
}

export async function cancelTerminalCheckout(id: string): Promise<CheckoutState> {
  if (isSimulatedSquareId(id)) return { id, status: "CANCELED", paymentId: null, cancelReason: "SELLER_CANCELED" };
  const data = await squareFetch(`/terminals/checkouts/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} });
  return toState(data.checkout);
}

function toState(c: any): CheckoutState {
  return {
    id: c.id,
    status: c.status,
    paymentId: c.payment_ids?.[0] ?? null,
    cancelReason: c.cancel_reason ?? null,
  };
}

// ── Refunds ────────────────────────────────────────────────────────────────────
/** True when this payments row is a real (not simulated) completed Square charge. */
export function isRealSquarePayment(p: { method: string; square_payment_id?: string | null }): boolean {
  return p.method === "square" && !!p.square_payment_id && !isSimulatedSquareId(p.square_payment_id);
}

/** Refund part or all of a Square payment. Simulated payments are a no-op. */
export async function refundSquarePayment(paymentId: string, amountCents: number, reason: string, idempotencyKey: string): Promise<void> {
  if (isSimulatedSquareId(paymentId)) return;
  if (!isSquareConfigured()) throw new Error("Square keys are not configured — can't refund a Square card payment.");
  await squareFetch("/refunds", {
    body: {
      idempotency_key: key45(idempotencyKey),
      payment_id: paymentId,
      amount_money: usd(amountCents),
      reason: reason.slice(0, 192),
    },
  });
}

// ── Device pairing ─────────────────────────────────────────────────────────────
/** Start pairing: Square returns a code the owner types on the Terminal's sign-in screen. */
export async function createDeviceCode(name: string): Promise<{ id: string; code: string; expiresAt: string | null }> {
  const data = await squareFetch("/devices/codes", {
    body: {
      idempotency_key: randomUUID(),
      device_code: { name: name.slice(0, 100), product_type: "TERMINAL_API", location_id: process.env.SQUARE_LOCATION_ID },
    },
  });
  const d = data.device_code;
  return { id: d.id, code: d.code, expiresAt: d.pair_by ?? null };
}

export async function getDeviceCode(id: string): Promise<{ status: string; deviceId: string | null }> {
  const data = await squareFetch(`/devices/codes/${encodeURIComponent(id)}`);
  return { status: data.device_code.status, deviceId: data.device_code.device_id ?? null };
}

// ── Webhooks ───────────────────────────────────────────────────────────────────
export function squareWebhookUrl(): string {
  return process.env.SQUARE_WEBHOOK_URL
    || `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/api/payments/square-webhook`;
}

/** Square signs notification URL + raw body with HMAC-SHA256 (base64). */
export function verifySquareSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  if (!key || !signature) return false;
  const expected = createHmac("sha256", key).update(squareWebhookUrl() + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
