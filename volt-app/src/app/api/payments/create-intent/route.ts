import { NextRequest, NextResponse } from "next/server";
import { getStripeServer, isStripeConfigured } from "@/lib/stripe/server";

// POST /api/payments/create-intent
// Creates a Stripe PaymentIntent and returns the clientSecret for the browser.
// Body: { amountCents, customerEmail, customerName, metadata }

export async function POST(request: NextRequest) {
  try {
    const { amountCents, customerEmail, customerName, metadata } = await request.json();

    if (!amountCents || amountCents < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // ── Dev/staging: Stripe not configured ────────────────────────────────────
    if (!isStripeConfigured()) {
      console.log("💳 [STRIPE SIMULATED] PaymentIntent would be created for:");
      console.log(`   Amount: $${(amountCents / 100).toFixed(2)}`);
      console.log(`   Customer: ${customerName} <${customerEmail}>`);
      console.log(`   Metadata:`, metadata);

      // Return a fake clientSecret so the booking flow can complete in dev
      return NextResponse.json({
        clientSecret: `pi_simulated_${Date.now()}_secret_simulated`,
        paymentIntentId: `pi_simulated_${Date.now()}`,
        simulated: true,
      });
    }

    // ── Real Stripe ────────────────────────────────────────────────────────────
    const stripe = getStripeServer()!;

    // Find or create Stripe customer for saved payment methods
    let customerId: string | undefined;
    if (customerEmail) {
      const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
        });
        customerId = newCustomer.id;
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      receipt_email: customerEmail,
      automatic_payment_methods: { enabled: true },
      metadata: {
        ...metadata,
        platform: "volt_transportation",
      },
      description: `Volt Transportation — ${metadata?.route ?? "Shuttle Booking"}`,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      simulated: false,
    });
  } catch (err) {
    console.error("[create-intent]", err);
    const message = err instanceof Error ? err.message : "Payment initialization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
