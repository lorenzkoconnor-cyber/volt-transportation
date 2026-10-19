import { NextRequest, NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { loadMessageInfo, sendReservationText } from "@/lib/reservation-messages";

// POST /api/booking/text-alerts  { confirmationNumber, phone, consent: true }
// The public /text-alerts opt-in page (the "call to action" URL given to
// RingCentral for 10DLC). Turns on booking texts for one reservation when the
// confirmation number + booking phone match, then texts an opt-in receipt.

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "text-alerts", 10, 15 * 60_000);
  if (limited) return limited;
  try {
    const { confirmationNumber, phone, consent } = await request.json().catch(() => ({}));
    if (consent !== true) {
      return NextResponse.json({ error: "Check the box to agree to receive text messages." }, { status: 400 });
    }
    const conf = String(confirmationNumber ?? "").trim().toUpperCase();
    const given = digits(phone);
    if (!/^VOLT-[A-Z0-9]{6}$/.test(conf) || given.length < 10) {
      return NextResponse.json({ error: "Enter your confirmation number and a 10-digit mobile number." }, { status: 400 });
    }

    const sb = createAdminDb();
    const { data: resv } = await sb
      .from("reservations")
      .select("id, status, sms_consent, customer:customers(phone)")
      .eq("confirmation_number", conf)
      .is("deleted_at", null)
      .maybeSingle();
    const booked = digits((resv?.customer as { phone?: string } | null)?.phone);
    if (!resv || !booked || booked.slice(-10) !== given.slice(-10)) {
      return NextResponse.json(
        { error: "No reservation found. Check your confirmation number and the phone number used at booking." },
        { status: 404 },
      );
    }
    if (resv.status === "cancelled") {
      return NextResponse.json({ error: "This reservation is cancelled." }, { status: 400 });
    }
    if (resv.sms_consent) return NextResponse.json({ ok: true, already: true });

    const { error } = await sb
      .from("reservations")
      .update({ sms_consent: true, sms_consent_at: new Date().toISOString(), sms_consent_source: "online" })
      .eq("id", resv.id);
    if (error) throw error;

    const info = await loadMessageInfo(sb, resv.id);
    if (info) {
      await sendReservationText(
        sb, info,
        `Volt Transportation: You're signed up for booking texts for ${conf}. ` +
        "Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.",
        "sms_opt_in",
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[booking/text-alerts]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
