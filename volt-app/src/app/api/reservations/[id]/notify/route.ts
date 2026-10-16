import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import {
  confirmationMessage, loadMessageInfo, receiptMessage, sendReservationEmail, sendReservationText,
} from "@/lib/reservation-messages";

// POST /api/reservations/[id]/notify  { type: "confirmation" | "receipt", channel?: "sms" | "email" }
// Texts (default) or emails the customer on file their booking confirmation or
// a receipt link.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  try {
    const { type, channel = "sms" } = await request.json().catch(() => ({}));
    if (type !== "confirmation" && type !== "receipt") {
      return NextResponse.json({ error: "Unknown message type." }, { status: 400 });
    }
    const info = await loadMessageInfo(ctx.sb, id);
    if (!info) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const email = channel === "email";
    const msg = type === "confirmation" ? await confirmationMessage(ctx.sb, info) : await receiptMessage(ctx.sb, info);
    const result = email
      ? await sendReservationEmail(ctx.sb, info, { subject: msg.emailSubject, body: msg.emailBody }, null)
      : await sendReservationText(ctx.sb, info, msg.sms, null);
    if (!result.sent) {
      return NextResponse.json({ error: result.error ?? `The ${email ? "email" : "text"} could not be sent.` }, { status: 502 });
    }
    const to = email ? info.email : info.phone;

    await ctx.sb.from("reservation_changes").insert({
      reservation_id: id,
      employee_id: ctx.employee.id,
      employee_name: ctx.employee.name,
      action: "text_sent",
      summary: [`${type === "confirmation" ? "Confirmation" : "Receipt"} ${email ? "emailed" : "texted"} to ${to}`],
      applied_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    console.error("[reservations/notify]", err);
    return NextResponse.json({ error: "The text could not be sent." }, { status: 500 });
  }
}
