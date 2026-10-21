import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { startRideAlongCheckout } from "@/lib/ride-along";

// POST /api/ride-along/checkout — the rider's /ride/<token> page pressing Pay.
// Body: { token, adults, children, pets, extraBags, primaryPassenger, tipCents,
//         smsConsent, termsAgreed }. Priced here; returns the PaymentIntent.
// The browser then calls /api/booking/create { checkoutId, paymentIntentId }
// like any online booking (the Stripe webhook does too).
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "ride-along-checkout", 20, 15 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await startRideAlongCheckout(String(body?.token ?? ""), body);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[ride-along/checkout]", err);
    return NextResponse.json({ error: "Payment couldn't be started. Please try again." }, { status: 500 });
  }
}
