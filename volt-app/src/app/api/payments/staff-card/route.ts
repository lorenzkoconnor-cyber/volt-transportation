import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/server";
import { createAdminDb, isSimulatedPaymentId } from "@/lib/checkout";

// POST /api/payments/staff-card
// Staff take a card over the phone / at the counter for a pending card payment
// (New Reservation, or "Charge Card" on a reservation).
//
//   { action: "intent",  paymentId } → { clientSecret, simulated }
//   { action: "confirm", paymentId } → { ok: true } once Stripe says succeeded
//
// The amount comes from the payments row, never the browser. One PaymentIntent
// per payment row (reused on retry after a decline). The webhook also marks the
// row paid via metadata.staff_payment_id if the browser never calls confirm.

const STAFF_ROLES = ["owner", "manager", "office_staff"];

export async function POST(request: NextRequest) {
  try {
    const { action, paymentId } = await request.json();
    if (!paymentId || (action !== "intent" && action !== "confirm")) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const sb = createAdminDb();
    const { data: employee } = await sb
      .from("employees")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();
    if (!employee || !STAFF_ROLES.includes(employee.role)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const { data: payment } = await sb
      .from("payments")
      .select("id, method, status, amount_cents, stripe_payment_intent_id, reservation:reservations(id, confirmation_number, status, total_cents, customer:customers(first_name, last_name, phone))")
      .eq("id", paymentId)
      .single();
    if (!payment || payment.method !== "stripe") {
      return NextResponse.json({ error: "Card payment not found." }, { status: 404 });
    }
    if (payment.status === "paid") return NextResponse.json({ ok: true, alreadyPaid: true });
    if (payment.status !== "pending") {
      return NextResponse.json({ error: `This payment is ${payment.status}.` }, { status: 400 });
    }
    const resv = payment.reservation;
    if (!resv || resv.status === "cancelled") {
      return NextResponse.json({ error: "This reservation is cancelled." }, { status: 400 });
    }
    if (payment.amount_cents < 50 || payment.amount_cents > resv.total_cents) {
      return NextResponse.json({ error: "Invalid card amount." }, { status: 400 });
    }

    const stripe = getStripeServer();

    if (action === "intent") {
      // Simulated mode (no Stripe keys)
      if (!stripe) {
        const fakeId = payment.stripe_payment_intent_id ?? `pi_simulated_staff_${Date.now()}`;
        await sb.from("payments").update({ stripe_payment_intent_id: fakeId }).eq("id", payment.id);
        return NextResponse.json({ clientSecret: `${fakeId}_secret_simulated`, simulated: true });
      }

      const customer = resv.customer;
      const pi = await stripe.paymentIntents.create(
        {
          amount: payment.amount_cents,
          currency: "usd",
          payment_method_types: ["card"],
          description: `Volt Transportation — ${resv.confirmation_number} (staff)`,
          metadata: {
            platform: "volt_transportation",
            staff_payment_id: payment.id,
            reservation_id: resv.id,
            confirmation_number: resv.confirmation_number,
            customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
            customer_phone: customer?.phone ?? "",
            employee_id: employee.id,
          },
        },
        { idempotencyKey: `volt-staff-card-${payment.id}-${payment.amount_cents}` },
      );
      if (pi.id !== payment.stripe_payment_intent_id) {
        await sb.from("payments").update({ stripe_payment_intent_id: pi.id }).eq("id", payment.id);
      }
      return NextResponse.json({ clientSecret: pi.client_secret, simulated: false });
    }

    // ── confirm ──────────────────────────────────────────────────────────────
    const piId = payment.stripe_payment_intent_id as string | null;
    if (!piId) return NextResponse.json({ error: "No card charge started." }, { status: 400 });

    let chargeId: string | null = null;
    if (!isSimulatedPaymentId(piId)) {
      if (!stripe) return NextResponse.json({ error: "Stripe keys are not configured." }, { status: 500 });
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status !== "succeeded") {
        return NextResponse.json({ error: "The card has not been charged." }, { status: 400 });
      }
      chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
    }

    await sb
      .from("payments")
      .update({ status: "paid", captured_at: new Date().toISOString(), stripe_charge_id: chargeId })
      .eq("id", payment.id)
      .eq("status", "pending");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[staff-card]", err);
    const message = err instanceof Error ? err.message : "Card payment failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
