import { NextRequest, NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";

// POST /api/payments/webhook
// Stripe sends events here after payment success, failure, refund, etc.
//
// Register in Stripe Dashboard → Developers → Webhooks:
//   URL: https://volttransportation.com/api/payments/webhook
//   Events: payment_intent.succeeded, payment_intent.payment_failed,
//            charge.refunded

export async function POST(request: NextRequest) {
  const stripe = getStripeServer();

  if (!stripe) {
    // Simulated mode — acknowledge without processing
    return NextResponse.json({ received: true, simulated: true });
  }

  const sig  = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed";
    console.error("[webhook] Signature error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(`[webhook] Event received: ${event.type}`);

  try {
    switch (event.type) {
      // ── Payment succeeded ──────────────────────────────────────────────────
      // The reservation, seat reservation, payment record, and confirmation SMS
      // are all written authoritatively by /api/booking/create the moment the
      // browser confirms payment. This webhook is a reconciliation backup: it
      // idempotently marks the payment row paid (and attaches the charge id for
      // later refunds) in case that row was written a beat after this event.
      case "payment_intent.succeeded": {
        const pi = event.data.object;

        await supabase
          .from("payments")
          .update({
            status: "paid",
            stripe_charge_id: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
          })
          .eq("stripe_payment_intent_id", pi.id);

        await supabase.from("audit_logs").insert({
          actor_id: "stripe_webhook",
          actor_role: "system",
          action: "payment.succeeded",
          table_name: "payments",
          record_id: pi.id,
          new_data: { amount: pi.amount, currency: pi.currency },
        });

        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", pi.id);

        console.warn(`[webhook] Payment failed for PI: ${pi.id}`);
        break;
      }

      // ── Refund issued ──────────────────────────────────────────────────────
      // Fires for refunds initiated either from our dashboard (/api/payments/
      // refund) or directly in the Stripe dashboard. A FULL refund cancels the
      // reservation and frees its seats; the guarded update below frees seats
      // exactly once even when the refund route already handled it.
      case "charge.refunded": {
        const charge = event.data.object;
        const refundAmount = charge.amount_refunded;
        const isFullRefund = charge.amount_refunded >= charge.amount;

        const { data: payment } = await supabase
          .from("payments")
          .select("id, reservation_id")
          .eq("stripe_charge_id", charge.id)
          .single();

        if (payment) {
          await supabase
            .from("payments")
            .update({
              status: isFullRefund ? "refunded" : "paid",
              refund_amount_cents: refundAmount,
              refunded_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          if (isFullRefund && payment.reservation_id) {
            const { data: cancelled } = await supabase
              .from("reservations")
              .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
              .eq("id", payment.reservation_id)
              .neq("status", "cancelled")
              .select("trip_id, return_trip_id, adults, children");

            if (cancelled && cancelled.length > 0) {
              const r = cancelled[0];
              const seats = (r.adults ?? 0) + (r.children ?? 0);
              await supabase.rpc("decrement_seats_booked", { p_trip_id: r.trip_id, p_count: seats });
              if (r.return_trip_id) {
                await supabase.rpc("decrement_seats_booked", { p_trip_id: r.return_trip_id, p_count: seats });
              }
            }
          }

          await supabase.from("audit_logs").insert({
            actor_id: "stripe_webhook",
            actor_role: "system",
            action: "payment.refunded",
            table_name: "payments",
            record_id: payment.id,
            new_data: { refund_amount_cents: refundAmount, full_refund: isFullRefund },
          });
        }
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook] Processing error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
