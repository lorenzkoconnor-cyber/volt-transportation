import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { cancelReservation } from "@/lib/cancellation";

// POST /api/reservations/[id]/cancel  { waiveFee? }
// Staff cancellation: frees the seats, keeps the cancellation fee and refunds
// the rest automatically (card first, then cash to hand back). Only owners and
// managers may waive the fee. See src/lib/cancellation.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await cancelReservation(ctx.sb, id, {
      kind: "staff",
      employee: ctx.employee,
      userId: ctx.userId,
      waiveFee: body.waiveFee === true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 400 });
  } catch (err) {
    console.error("[reservations/cancel]", err);
    return NextResponse.json({ ok: false, error: "Cancellation failed." }, { status: 500 });
  }
}
