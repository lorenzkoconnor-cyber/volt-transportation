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
    const { error: updErr } = await admin
      .from("payments")
      .update({
        status: totalRefunded >= payment.amount_cents ? "refunded" : payment.status,
        refund_amount_cents: totalRefunded,
        refunded_at: new Date().toISOString(),
        refunded_by_employee_id: employee.id,
      })
      .eq("id", paymentId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: employee.role,
      action: "payment.refunded",
      table_name: "payments",
      record_id: paymentId,
      new_data: { refund_cents: refundCents, stripe: !!isRealStripeCharge },
    });

    return NextResponse.json({ success: true, refundedCents: refundCents });
  } catch (err) {
    console.error("[payments/refund]", err);
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
