// ─── Stripe Server-Side Client ────────────────────────────────────────────────
// Returns null when credentials are placeholders (dev mode).
// Returns real Stripe instance when real keys are present.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_") && !key.includes("placeholder") && key.length > 20;
}

export function getStripeServer(): Stripe | null {
  if (!isStripeConfigured()) return null;

  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
  });
}

export { isStripeConfigured };
