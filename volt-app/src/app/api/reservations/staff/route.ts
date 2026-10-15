import { NextRequest, NextResponse } from "next/server";
import { createStaffReservation, normalizePayment, normalizeStaffInput, requireStaff } from "@/lib/staff-booking";

// POST /api/reservations/staff — Team Portal "New Reservation".
// Body: trip/party/passenger/flight choices (same shape as checkout) plus
// { customer, discount, termsAgreed, payment }. Prices are computed here.
// → { id, confirmationNumber, cardPaymentId } — when cardPaymentId is set the
//   browser charges that pending card payment next (/api/payments/staff-card).
export async function POST(request: NextRequest) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await request.json();
    const input = normalizeStaffInput(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const result = await createStaffReservation(ctx, input, normalizePayment(body.payment));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[reservations/staff]", err);
    return NextResponse.json({ error: "Could not create the reservation." }, { status: 500 });
  }
}
