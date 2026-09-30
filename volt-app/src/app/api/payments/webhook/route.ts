import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeServer } from "@/lib/stripe/server";
import { createAdminDb, finalizeCheckout } from "@/lib/checkout";

// POST /api/payments/webhook
// Stripe sends payment events here. Signature-verified with STRIPE_WEBHOOK_SECRET.
//
// Register in Stripe Dashboard → Developers → Webhooks:
//   URL: https://volt-transportation.com/api/payments/webhook
//   Events: payment_intent.succeeded, payment_intent.amount_capturable_updated,
//           payment_intent.payment_failed, payment_intent.canceled, charge.refunded
//
// Every handler is idempotent — Stripe may deliver an event more than once.

export async function POST(request: NextRequest) {
  const stripe = getStripeServer();
  if (!stripe) {
    // Simulated mode — acknowledge without processing
    return NextResponse.json({ received: true, simulated: true });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secret.startsWith("whsec_") || secret.includes("placeholder")) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    console.error("[webhook] Signature error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const sb = createAdminDb();
  console.log(`[webhook] ${event.type} ${event.id}`);

  try {
    switch (event.type) {
      // ── Payment authorized (hold) or completed ─────────────────────────────
      // Creates the reservation if the browser didn't get to it (rider closed
      // or refreshed the page). No-op when it already exists.
      case "payment_intent.amount_capturable_updated":
      case "payment_intent.succeeded": {
        const pi = event.data.object;

        // A hold captured from the Verifications queue: sync the final amount.
        if (event.type === "payment_intent.succeeded") {
          await sb
            .from("payments")
            .update({
              status: "paid",
              amount_cents: pi.amount_received,
              captured_at: new Date().toISOString(),
              stripe_charge_id: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
            })
            .eq("stripe_payment_intent_id", pi.id)
            .eq("status", "authorized");
        }

        const checkoutId = pi.metadata?.checkout_id;
        if (checkoutId) {
          const result = await finalizeCheckout(checkoutId, pi.id, "webhook");
          if (!result.ok && result.processing) {
            // The browser is mid-finalization — ask Stripe to retry shortly.
            return NextResponse.json({ retry: true }, { status: 503 });
          }
          if (!result.ok) console.warn(`[webhook] checkout ${checkoutId} not finalized: ${result.error}`);
        }
        break;
      }

      // ── Payment attempt failed (card declined etc.) ────────────────────────
      // The rider can retry with another card on the same PaymentIntent, so
      // the checkout stays open. Nothing is booked until a payment succeeds.
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.warn(`[webhook] Payment failed for ${pi.id}: ${pi.last_payment_error?.message ?? "unknown"}`);
        break;
      }

      // ── PaymentIntent cancelled ────────────────────────────────────────────
      // Either we released a hold, or an authorization expired (7 days)
      // before it was captured. If the booking is still active it is now
      // unpaid — the payment row's note tells staff to collect payment.
      case "payment_intent.canceled": {
        const pi = event.data.object;
        await sb
          .from("payments")
          .update({
            status: "voided",
            notes: pi.cancellation_reason === "automatic"
              ? "Card hold expired before it was captured — collect payment from the rider."
              : "Card hold released.",
          })
          .eq("stripe_payment_intent_id", pi.id)
          .eq("status", "authorized");
        await sb
          .from("booking_checkouts")
          .update({ status: "failed", error: "Payment was cancelled." })
          .eq("stripe_payment_intent_id", pi.id)
          .eq("status", "open");
        break;
      }

      // ── Refund issued ──────────────────────────────────────────────────────
      // Fires for refunds from our dashboard (/api/payments/refund), the Stripe
      // Dashboard, and when Stripe releases the uncaptured part of a hold. A
      // FULL refund cancels the reservation and frees its seats exactly once.
      case "charge.refunded": {
        const charge = event.data.object;
        if (!charge.captured) break; // an expired/released hold — handled by payment_intent.canceled

        const { data: payment } = await sb
          .from("payments")
          .select("id, reservation_id, status")
          .eq("stripe_payment_intent_id", typeof charge.payment_intent === "string" ? charge.payment_intent : "")
          .maybeSingle();
        if (!payment || payment.status === "authorized") break;

        // Money actually returned to the rider = Refund objects on the charge.
        // (The uncaptured remainder of a partial capture is not a refund.)
        const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
        const refundedCents = refunds.data
          .filter((r) => r.status === "succeeded" || r.status === "pending")
          .reduce((sum, r) => sum + r.amount, 0);
        const isFullRefund = refundedCents >= charge.amount_captured;

        await sb
          .from("payments")
          .update({
            status: isFullRefund ? "refunded" : "paid",
            refund_amount_cents: refundedCents,
            refunded_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        if (isFullRefund && payment.reservation_id) {
          const { data: cancelled } = await sb
            .from("reservations")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", payment.reservation_id)
            .neq("status", "cancelled")
            .select("trip_id, return_trip_id, adults, children");

          if (cancelled && cancelled.length > 0) {
            const r = cancelled[0];
            const seats = (r.adults ?? 0) + (r.children ?? 0);
            await sb.rpc("decrement_seats_booked", { p_trip_id: r.trip_id, p_count: seats });
            if (r.return_trip_id) {
              await sb.rpc("decrement_seats_booked", { p_trip_id: r.return_trip_id, p_count: seats });
            }
          }
        }

        await sb.from("audit_logs").insert({
          actor_id: "stripe_webhook",
          actor_role: "system",
          action: "payment.refunded",
          table_name: "payments",
          record_id: payment.id,
          new_data: { refund_amount_cents: refundedCents, full_refund: isFullRefund },
        });
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // 500 → Stripe retries the event with backoff.
    console.error("[webhook] Processing error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

