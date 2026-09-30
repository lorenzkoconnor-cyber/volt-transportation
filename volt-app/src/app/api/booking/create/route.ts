import { NextRequest, NextResponse } from "next/server";
import { finalizeCheckout } from "@/lib/checkout";

// POST /api/booking/create  { checkoutId, paymentIntentId }
// Called by the browser right after Stripe confirms the payment. Verifies the
// PaymentIntent with Stripe and creates the reservation (see src/lib/checkout.ts).
// The Stripe webhook runs the same finalization, so the booking is confirmed
// even if the rider closes the page before this call lands. Safe to repeat:
// a checkout only ever produces one reservation.
//
// 200 → { success, confirmationNumber, reservationId, military }
// 202 → { processing: true } — the webhook is finalizing it; poll again.
export async function POST(request: NextRequest) {
  try {
    const { checkoutId, paymentIntentId } = await request.json();
    if (!checkoutId || !paymentIntentId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await finalizeCheckout(String(checkoutId), String(paymentIntentId), "client");
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, processing: !!result.processing },
        { status: result.status },
      );
    }
    return NextResponse.json({
      success: true,
      confirmationNumber: result.confirmationNumber,
      reservationId: result.reservationId,
      military: result.military,
    });
  } catch (err) {
    console.error("[booking/create]", err);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}
