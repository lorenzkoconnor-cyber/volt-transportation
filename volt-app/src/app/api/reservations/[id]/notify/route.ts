import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { confirmationText, loadMessageInfo, receiptText, sendReservationText } from "@/lib/reservation-messages";

// POST /api/reservations/[id]/notify  { type: "confirmation" | "receipt" }
// Texts the customer on file their booking confirmation or a receipt link.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const { type } = await request.json().catch(() => ({}));
    if (type !== "confirmation" && type !== "receipt") {
      return NextResponse.json({ error: "Unknown message type." }, { status: 400 });
    }
    const info = await loadMessageInfo(ctx.sb, id);
    if (!info) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const result = await sendReservationText(
      ctx.sb, info, type === "confirmation" ? confirmationText(info) : receiptText(info), null,
    );
    if (!result.sent) return NextResponse.json({ error: result.error ?? "The text could not be sent." }, { status: 502 });

    await ctx.sb.from("reservation_changes").insert({
      reservation_id: id,
      employee_id: ctx.employee.id,
      employee_name: ctx.employee.name,
      action: "text_sent",
      summary: [`${type === "confirmation" ? "Confirmation" : "Receipt"} texted to ${info.phone}`],
      applied_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, simulated: result.simulated, phone: info.phone });
  } catch (err) {
    console.error("[reservations/notify]", err);
    return NextResponse.json({ error: "The text could not be sent." }, { status: 500 });
  }
}
