import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { cancelReservation, previewCancellation } from "@/lib/cancellation";

// GET  /api/reservations/[id]/cancel?waiveFee=1
//   What each cancel button would do (refund + kept amounts). Changes nothing.
// POST /api/reservations/[id]/cancel  { refund: "partial" | "none", waiveFee? }
//   Staff cancellation: frees the seats still to come and refunds per the
//   button picked — "partial" keeps the cancellation fee (plus the ride already
//   taken and any tip, if the first leg has run); "none" keeps everything.
//   Any office staff may pick either; only owners/managers may waive the fee.
//   See src/lib/cancellation.ts.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const waive = request.nextUrl.searchParams.get("waiveFee") === "1";
  const preview = await previewCancellation(ctx.sb, id, waive);
  return NextResponse.json(preview, { status: preview.ok ? 200 : preview.status ?? 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.refund !== "partial" && body.refund !== "none") {
      return NextResponse.json({ ok: false, error: "Pick a refund option." }, { status: 400 });
    }
    const result = await cancelReservation(ctx.sb, id, {
      kind: "staff",
      employee: ctx.employee,
      userId: ctx.userId,
      refund: body.refund,
      waiveFee: body.refund === "partial" && body.waiveFee === true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 400 });
  } catch (err) {
    console.error("[reservations/cancel]", err);
    return NextResponse.json({ ok: false, error: "Cancellation failed." }, { status: 500 });
  }
}
