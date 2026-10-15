import { NextRequest, NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { confirmationText, loadMessageInfo, sendReservationText } from "@/lib/reservation-messages";

// POST /api/booking/text-confirmation  { confirmationNumber }
// The "Text me my confirmation" button on the booking confirmation page.
// Only ever texts the phone number already on the booking, a few times an hour.
const MAX_PER_HOUR = 3;

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "text-confirmation", 5, 15 * 60_000);
  if (limited) return limited;
  try {
    const { confirmationNumber } = await request.json().catch(() => ({}));
    const conf = String(confirmationNumber ?? "").trim().toUpperCase();
    if (!/^VOLT-[A-Z0-9]{6}$/.test(conf)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    const sb = createAdminDb();
    const { data: resv } = await sb
      .from("reservations").select("id, status").eq("confirmation_number", conf).maybeSingle();
    if (!resv || resv.status === "cancelled") return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await sb
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("reservation_id", resv.id)
      .eq("kind", "confirmation_resend")
      .gte("sent_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return NextResponse.json({ error: "We've already texted this booking a few times — please check your messages." }, { status: 429 });
    }

    const info = await loadMessageInfo(sb, resv.id);
    if (!info) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const result = await sendReservationText(sb, info, confirmationText(info), "confirmation_resend");
    if (!result.sent) return NextResponse.json({ error: "We couldn't send the text. Please try again." }, { status: 502 });

    const digits = info.phone.replace(/\D/g, "");
    return NextResponse.json({ ok: true, phoneEnding: digits.slice(-4) });
  } catch (err) {
    console.error("[booking/text-confirmation]", err);
    return NextResponse.json({ error: "We couldn't send the text. Please try again." }, { status: 500 });
  }
}
