// ─── Stripe Browser-Side Client ──────────────────────────────────────────────
import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const isReal = key.startsWith("pk_") && !key.includes("placeholder") && key.length > 20;

  if (!isReal) {
    console.warn("⚠️  Stripe publishable key is a placeholder. Payments are simulated.");
    return Promise.resolve(null);
  }

  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
