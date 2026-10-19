import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { easternToday } from "@/lib/format";

// DELETE /api/reservations/[id]
// Owner/manager only. Hides the reservation everywhere (sets deleted_at) but
// keeps it and its payments in the database so money records stay intact.
// Upcoming reservations must be cancelled first, so the seats are freed, the
// refund runs and the customer is told (see migration 026).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.employee.role !== "owner" && ctx.employee.role !== "manager") {
    return NextResponse.json({ ok: false, error: "Only owners and managers can delete reservations." }, { status: 403 });
  }
  const { id } = await params;

  const { data: r } = await ctx.sb
    .from("reservations")
    .select(
      "id, status, confirmation_number, deleted_at, " +
      "trip:trips!reservations_trip_id_fkey(departure_date), " +
      "return_trip:trips!reservations_return_trip_id_fkey(departure_date)"
    )
    .eq("id", id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resv = r as any;
  if (!resv || resv.deleted_at) {
    return NextResponse.json({ ok: false, error: "Reservation not found." }, { status: 404 });
  }

  const today = easternToday();
  const upcoming = [resv.trip?.departure_date, resv.return_trip?.departure_date]
    .some((d: string | undefined) => d && d >= today);
  if (resv.status !== "cancelled" && upcoming) {
    return NextResponse.json(
      { ok: false, error: "This reservation is still upcoming. Cancel it first, then delete it." },
      { status: 409 }
    );
  }

  const { error } = await ctx.sb
    .from("reservations")
    .update({ deleted_at: new Date().toISOString(), deleted_by_employee_id: ctx.employee.id })
    .eq("id", id);
  if (error) {
    console.error("[reservations/delete]", error);
    return NextResponse.json({ ok: false, error: "Couldn't delete the reservation." }, { status: 500 });
  }

  await ctx.sb.from("audit_logs").insert({
    actor_id: ctx.userId,
    actor_role: ctx.employee.role,
    action: "reservation.deleted",
    table_name: "reservations",
    record_id: id,
    new_data: { confirmation_number: resv.confirmation_number, status: resv.status, by: ctx.employee.name },
  });

  return NextResponse.json({ ok: true });
}
