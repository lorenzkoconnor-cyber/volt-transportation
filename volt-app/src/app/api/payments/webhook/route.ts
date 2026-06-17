import { NextRequest, NextResponse } from "next/server";
import { getStripeServer } from "@/lib/stripe/server";
import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
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
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const meta = pi.metadata as Record<string, string>;

        // 1. Mark payment as paid in our DB
        await supabase
          .from("payments")
          .update({
            status: "paid",
            stripe_charge_id: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
          })
          .eq("stripe_payment_intent_id", pi.id);

        // 2. Confirm reservation status
        if (meta.reservationId) {
          await supabase
            .from("reservations")
            .update({ status: "confirmed" })
            .eq("id", meta.reservationId);

          // 3. Send booking confirmation SMS
          if (meta.customerPhone && meta.confirmationNumber) {
            const date = new Date(meta.tripDate || Date.now());
            const dateStr = date.toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            });
            await sendSMS(
              meta.customerPhone,
              SMS_TEMPLATES.bookingConfirmation({
                confirmationNumber: meta.confirmationNumber,
                date: dateStr,
                time: meta.tripTime ?? "",
                from: meta.tripFrom ?? "",
                to: meta.tripTo ?? "",
                passengerName: meta.passengerName ?? "Passenger",
              })
            );
          }
        }

        // 4. Update trip seat count
        if (meta.tripId && meta.passengerCount) {
          const count = parseInt(meta.passengerCount, 10);
          // Use a raw query to increment safely
          await supabase.rpc("increment_seats_booked", {
            p_trip_id: meta.tripId,
            p_count: count,
          });
        }

        // 5. Audit log
        await supabase.from("audit_logs").insert({
          actor_id: "stripe_webhook",
          actor_role: "system",
          action: "payment.succeeded",
          table_name: "payments",
          record_id: pi.id,
          new_data: { amount: pi.amount, currency: pi.currency, reservation_id: meta.reservationId },
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
      case "charge.refunded": {
        const charge = event.data.object;
        const refundAmount = charge.amount_refunded;

        const { data: payment } = await supabase
          .from("payments")
          .select("id, reservation_id")
          .eq("stripe_charge_id", charge.id)
          .single();

        if (payment) {
          await supabase
            .from("payments")
            .update({
              status: "refunded",
              refund_amount_cents: refundAmount,
              refunded_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          // Update reservation status to cancelled
          await supabase
            .from("reservations")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", payment.reservation_id);

          // Audit log
          await supabase.from("audit_logs").insert({
            actor_id: "stripe_webhook",
            actor_role: "system",
            action: "payment.refunded",
            table_name: "payments",
            record_id: payment.id,
            new_data: { refund_amount_cents: refundAmount },
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
