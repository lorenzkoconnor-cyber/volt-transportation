import { NextRequest, NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { rateLimit } from "@/lib/rate-limit";
import {
  confirmationMessage, loadMessageInfo, sendReservationEmail, sendReservationText,
} from "@/lib/reservation-messages";
import { isSmsConfigured } from "@/lib/notifications/sms";
import { isDeliverableEmail } from "@/lib/notifications/email";

// POST /api/booking/text-confirmation  { confirmationNumber }
// The "Resend my confirmation" button on the booking confirmation page.
// Texts the phone on the booking — or, until texting is set up (or when there's
// no phone), emails the address on the booking. A few times an hour at most.
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
      .in("kind", ["confirmation_resend", "email_confirmation_resend"])
      .gte("sent_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return NextResponse.json({ error: "We've already sent this confirmation a few times — please check your messages." }, { status: 429 });
    }

    const info = await loadMessageInfo(sb, resv.id);
    if (!info) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const msg = await confirmationMessage(sb, info);
    // Texts only go to riders who opted in at checkout; everyone else gets email.
    const byText = !!info.phone && info.smsConsent && (isSmsConfigured() || !isDeliverableEmail(info.email));
    const result = byText
      ? await sendReservationText(sb, info, msg.sms, "confirmation_resend")
      : await sendReservationEmail(sb, info, { subject: msg.emailSubject, body: msg.emailBody }, "confirmation_resend");
    if (!result.sent) return NextResponse.json({ error: "We couldn't send your confirmation. Please try again." }, { status: 502 });

    if (byText) {
      const digits = info.phone.replace(/\D/g, "");
      return NextResponse.json({ ok: true, via: "sms", sentTo: `the phone ending in ${digits.slice(-4)}` });
    }
    const [user, domain] = info.email.split("@");
    return NextResponse.json({ ok: true, via: "email", sentTo: `${user.slice(0, 1)}•••@${domain}` });
  } catch (err) {
    console.error("[booking/text-confirmation]", err);
    return NextResponse.json({ error: "We couldn't send your confirmation. Please try again." }, { status: 500 });
  }
}
