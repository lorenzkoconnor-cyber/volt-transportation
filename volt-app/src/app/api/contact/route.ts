import { NextRequest, NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { loadAppSettings } from "@/lib/settings-server";
import { enqueue } from "@/lib/notifications/queue";
import { emailHtml, supportEmail } from "@/lib/notifications/email";

// POST /api/contact  { name, email, phone?, subject, message, website? }
// The Contact page form. Saves the message (Dashboard → Messages) and emails it
// to Volt support with the customer as Reply-To, through the message queue.
// `website` is a hidden spam trap: people never fill it in.

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/[\r\n]+/g, " ");

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "contact", 5, 60 * 60_000);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    if (clean(body.website, 200)) return NextResponse.json({ ok: true }); // bot — pretend it worked

    const name = oneLine(body.name, 120);
    const email = oneLine(body.email, 200).toLowerCase();
    const phone = oneLine(body.phone, 40);
    const subject = oneLine(body.subject, 200);
    const message = clean(body.message, 5000);

    if (!name || !subject || !message) {
      return NextResponse.json({ error: "Please fill in your name, subject and message." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const sb = createAdminDb();
    const { error } = await sb.from("contact_messages").insert({ name, email, phone: phone || null, subject, message });
    if (error) throw error;

    const text =
      `From: ${name} <${email}>${phone ? `\nPhone: ${phone}` : ""}\n` +
      `Subject: ${subject}\n\n${message}\n\n` +
      `Reply to this email to answer ${name.split(/\s+/)[0]} directly.`;
    await enqueue(sb, [{
      channel: "email",
      audience: "support",
      to: supportEmail(),
      replyTo: email,
      subject: `[Website] ${subject}`,
      text,
      html: emailHtml(`New message from ${name}`, text, undefined, (await loadAppSettings()).business),
      kind: "contact_form",
    }]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact]", err);
    return NextResponse.json({ error: "Your message couldn't be sent." }, { status: 500 });
  }
}
