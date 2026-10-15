import { NextRequest, NextResponse } from "next/server";
import { refundDifference, requireStaff } from "@/lib/staff-booking";

// POST /api/reservations/[id]/refund  { amountCents? }
// Refunds what the customer is owed after an edit lowered the price (omit
// amountCents for all of it). Never cancels the reservation. Capped at the
// amount owed, so office staff can use it too.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const amount = body.amountCents == null ? null : Math.round(Number(body.amountCents));
    const result = await refundDifference(ctx, id, amount);
    return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 400 });
  } catch (err) {
    console.error("[reservations/refund]", err);
    return NextResponse.json({ error: "Refund failed." }, { status: 500 });
  }
}
