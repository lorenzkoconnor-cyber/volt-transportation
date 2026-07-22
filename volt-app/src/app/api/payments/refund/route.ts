import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { getStripeServer, isStripeConfigured } from "@/lib/stripe/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminClient(): any {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/payments/refund
// Owner/manager only. Body: { paymentId, amountCents? } — omit amountCents for a full refund.
export async function POST(request: NextRequest) {
  try {
    const { paymentId, amountCents } = await request.json();
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    // Verify the caller is a signed-in owner or manager
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const admin = adminClient();
    const { data: employee } = await admin
      .from("employees")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!employee || !["owner", "manager"].includes(employee.role)) {
      return NextResponse.json({ error: "Only the owner or a manager can issue refunds" }, { status: 403 });
    }

    // Load the payment
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();
    if (payErr || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (payment.status === "refunded") {
      return NextResponse.json({ error: "Payment is already fully refunded" }, { status: 400 });
    }

    const maxRefundable = payment.amount_cents - payment.refund_amount_cents;
    const refundCents = amountCents ?? maxRefundable;
    if (refundCents <= 0 || refundCents > maxRefundable) {
      return NextResponse.json(
        { error: `Refund must be between $0.01 and $${(maxRefundable / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    // Real Stripe refund when this was a live card charge
    const pi = payment.stripe_payment_intent_id as string | null;
    const isRealStripeCharge = payment.method === "stripe" && pi && pi.startsWith("pi_") && !pi.startsWith("pi_simulated");
    if (isRealStripeCharge) {
      if (!isStripeConfigured()) {
        return NextResponse.json(
          { error: "Stripe keys are not configured — cannot refund a live card charge" },
          { status: 500 }
        );
      }
      const stripe = getStripeServer()!;
      await stripe.refunds.create({ payment_intent: pi, amount: refundCents });
    }

    const totalRefunded = payment.refund_amount_cents + refundCents;
    const isFullRefund = totalRefunded >= payment.amount_cents;
    const { error: updErr } = await admin
      .from("payments")
      .update({
        status: isFullRefund ? "refunded" : payment.status,
        refund_amount_cents: totalRefunded,
        refunded_at: new Date().toISOString(),
        refunded_by_employee_id: employee.id,
      })
      .eq("id", paymentId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // A FULL refund cancels the reservation and frees its seats. Partial refunds
    // leave the booking active (price adjustment / add-on refund).
    let reservationCancelled = false;
    if (isFullRefund && payment.reservation_id) {
      // Flip to cancelled only if it isn't already — the returned rows tell us
      // whether WE performed the cancellation, so seats are freed exactly once
      // even if Stripe's charge.refunded webhook runs the same logic.
      const { data: cancelled } = await admin
        .from("reservations")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", payment.reservation_id)
        .neq("status", "cancelled")
        .select("trip_id, return_trip_id, adults, children");

      if (cancelled && cancelled.length > 0) {
        reservationCancelled = true;
        const r = cancelled[0];
        const seats = (r.adults ?? 0) + (r.children ?? 0);
        await admin.rpc("decrement_seats_booked", { p_trip_id: r.trip_id, p_count: seats });
        if (r.return_trip_id) {
          await admin.rpc("decrement_seats_booked", { p_trip_id: r.return_trip_id, p_count: seats });
        }
      }
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: employee.role,
      action: "payment.refunded",
      table_name: "payments",
      record_id: paymentId,
      new_data: {
        refund_cents: refundCents,
        stripe: !!isRealStripeCharge,
        full_refund: isFullRefund,
        reservation_cancelled: reservationCancelled,
      },
    });

    return NextResponse.json({
      success: true,
      refundedCents: refundCents,
      fullRefund: isFullRefund,
      reservationCancelled,
    });
  } catch (err) {
    console.error("[payments/refund]", err);
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
