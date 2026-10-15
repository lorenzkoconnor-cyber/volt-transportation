import { NextRequest, NextResponse } from "next/server";
import { editAccess } from "@/lib/staff-pricing";
import {
  finishEdit, loadReservation, normalizePayment, normalizeStaffInput, planEdit, requireStaff, startEdit,
} from "@/lib/staff-booking";

// GET /api/reservations/[id]/edit → { reservation, mode, lockReason } for the edit form
// (mode "full" | "return_only" | null — see editAccess).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const reservation = await loadReservation(ctx.sb, id);
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  const access = editAccess(
    ctx.employee.role, reservation.status, reservation.trip, reservation.is_round_trip ? reservation.return_trip : null,
  );
  return NextResponse.json({ reservation, mode: access.mode, lockReason: access.reason });
}

// POST /api/reservations/[id]/edit — Team Portal "Edit Reservation".
//   { action: "quote", ...choices }            → what would change + price difference
//   { action: "apply", ...choices, payment }   → applies it, or (card/split extra
//                                                charge) returns a pending card
//                                                payment to charge first
//   { action: "complete", changeId }           → applies a change once its card is paid
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const body = await request.json();

    if (body.action === "complete") {
      const { data: change } = await ctx.sb
        .from("reservation_changes").select("id, reservation_id").eq("id", String(body.changeId ?? "")).maybeSingle();
      if (!change || change.reservation_id !== id) return NextResponse.json({ error: "Change not found." }, { status: 404 });
      const result = await finishEdit(ctx.sb, change.id);
      return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 400 });
    }

    const resv = await loadReservation(ctx.sb, id);
    if (!resv) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    const input = normalizeStaffInput(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

    if (body.action === "quote") {
      const plan = await planEdit(ctx.sb, resv, input, ctx.employee.role);
      if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: 400 });
      return NextResponse.json({
        summary: plan.summary,
        oldTotalCents: plan.oldTotalCents,
        newTotalCents: plan.newTotalCents,
        priceChangeCents: plan.priceChangeCents,
        refundDueAfterCents: plan.refundDueAfterCents,
      });
    }

    if (body.action === "apply") {
      const result = await startEdit(ctx, resv, input, normalizePayment(body.payment));
      return NextResponse.json(result, { status: result.ok ? 200 : result.status ?? 400 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("[reservations/edit]", err);
    return NextResponse.json({ error: "Could not update the reservation." }, { status: 500 });
  }
}
