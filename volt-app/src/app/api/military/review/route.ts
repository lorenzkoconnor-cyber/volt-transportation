import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createAdminClient } from "@/lib/supabase/server";
import { getStripeServer, isStripeConfigured } from "@/lib/stripe/server";
import { MILITARY_DISCOUNT_RATE } from "@/lib/booking";

// POST /api/military/review  { customerId, decision: 'approve' | 'reject' }
// Owner/manager only.
//
// Approve: mark the account verified, then settle every booking the rider made
//   while pending — refund the 5% (charged at full price up front) and record
//   the discount so it counts toward the monthly donation total.
// Reject: mark rejected and clear the pending flag on those bookings (they keep
//   the full price they paid).
export async function POST(request: NextRequest) {
  try {
    const { customerId, decision } = await request.json();
    if (!customerId || (decision !== "approve" && decision !== "reject")) {
      return NextResponse.json({ error: "customerId and a valid decision are required" }, { status: 400 });
    }

    // ── Authorize: owner or manager ──────────────────────────────────────────
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;

    const { data: employee } = await sb
      .from("employees")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();
    if (!employee || !["owner", "manager"].includes(employee.role)) {
      return NextResponse.json({ error: "Only an owner or manager can review verifications" }, { status: 403 });
    }

    const { data: customer } = await sb
      .from("customers")
      .select("id, military_status")
      .eq("id", customerId)
      .single();
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const now = new Date().toISOString();

    // ── Reject ───────────────────────────────────────────────────────────────
    if (decision === "reject") {
      await sb.from("customers").update({
        military_status: "rejected",
        is_military: false,
        military_reviewed_at: now,
        military_reviewed_by: employee.id,
      }).eq("id", customerId);

      // Pending bookings keep the full price they paid; drop them from the program.
      await sb.from("reservations")
        .update({ military_discount_pending: false, is_military: false })
        .eq("customer_id", customerId)
        .eq("military_discount_pending", true);

      await sb.from("audit_logs").insert({
        actor_id: user.id, actor_role: employee.role,
        action: "military.rejected", table_name: "customers", record_id: customerId,
        new_data: { decision },
      });

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ── Approve ───────────────────────────────────────────────────────────────
    await sb.from("customers").update({
      military_status: "approved",
      is_military: true,
      military_reviewed_at: now,
      military_reviewed_by: employee.id,
    }).eq("id", customerId);

    // Settle bookings charged at full price while the rider was pending.
    const { data: pending } = await sb
      .from("reservations")
      .select("id, subtotal_cents, discount_cents, total_cents")
      .eq("customer_id", customerId)
      .eq("military_discount_pending", true)
      .neq("status", "cancelled");

    const stripe = getStripeServer();
    let refundedCount = 0;
    let refundedCents = 0;
    let manualRefundsNeeded = 0;

    for (const r of pending ?? []) {
      const discountCents = Math.round(r.subtotal_cents * MILITARY_DISCOUNT_RATE);
      if (discountCents <= 0) continue;

      // Refund the discount on the card when this was a real Stripe charge.
      const { data: payment } = await sb
        .from("payments")
        .select("id, method, status, amount_cents, refund_amount_cents, stripe_payment_intent_id")
        .eq("reservation_id", r.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pi = payment?.stripe_payment_intent_id as string | null;
      const isRealStripeCharge =
        payment?.method === "stripe" && !!pi && pi.startsWith("pi_") && !pi.startsWith("pi_simulated");

      let refundedThis = false;
      if (isRealStripeCharge) {
        if (stripe && isStripeConfigured()) {
          try {
            await stripe.refunds.create({ payment_intent: pi!, amount: discountCents });
            refundedThis = true;
          } catch (e) {
            console.error("[military/review] stripe refund failed", e);
            manualRefundsNeeded += 1;
            continue; // leave pending flag so it can be retried
          }
        } else {
          // Live charge but no Stripe keys configured — can't refund automatically.
          manualRefundsNeeded += 1;
          continue;
        }
      }

      // Record the realized discount (counts toward the donation total) and,
      // when a card refund happened, bump the payment's refunded amount.
      await sb.from("reservations").update({
        discount_cents: discountCents,
        total_cents: r.subtotal_cents - discountCents,
        military_discount_pending: false,
      }).eq("id", r.id);

      if (payment && refundedThis) {
        await sb.from("payments").update({
          refund_amount_cents: (payment.refund_amount_cents ?? 0) + discountCents,
          refunded_at: now,
          refunded_by_employee_id: employee.id,
        }).eq("id", payment.id);
      }

      refundedCount += 1;
      refundedCents += discountCents;
    }

    await sb.from("audit_logs").insert({
      actor_id: user.id, actor_role: employee.role,
      action: "military.approved", table_name: "customers", record_id: customerId,
      new_data: { decision, refundedCount, refundedCents, manualRefundsNeeded },
    });

    return NextResponse.json({
      success: true,
      status: "approved",
      refundedCount,
      refundedCents,
      manualRefundsNeeded,
    });
  } catch (err) {
    console.error("[military/review]", err);
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}
