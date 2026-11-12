import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { smsProvider } from "@/lib/notifications/sms";
import { isDeliverableEmail, isEmailConfigured, emailHtml } from "@/lib/notifications/email";
import { enqueue } from "@/lib/notifications/queue";
import { loadAppSettings } from "@/lib/settings-server";
import { appUrl } from "@/lib/reservation-messages";
import { sampleLinks } from "@/lib/sample-pages";
import { TEMPLATES, mergeTemplate, renderTemplate, type TemplateKey } from "@/lib/message-templates";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Settings → Message Health (owners/managers).
// GET  → is texting/email connected, when the background worker last ran (and
//        what Supabase got back calling it), and the last day's outbox counts.
// POST { channel: "sms" | "email" } → send a test to the signed-in employee.
// POST { channel, template, sms?, emailSubject?, emailBody? } → send a SAMPLE of
//      that customer message (the wording on screen, or the saved wording),
//      filled in with sample details, to the signed-in employee.

async function ownerOrManager() {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  if (!["owner", "manager"].includes(ctx.employee.role)) {
    return NextResponse.json({ error: "Only an owner or manager can do this." }, { status: 403 });
  }
  return ctx;
}

export async function GET() {
  const ctx = await ownerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [worker, calls, recent] = await Promise.all([
    sb.from("system_status").select("value, updated_at").eq("key", "worker").maybeSingle(),
    sb.rpc("worker_call_history"),
    sb.from("notifications").select("type, status, attempts").gte("created_at", since),
  ]);
  const counts = { sent: 0, failed: 0, retrying: 0, notSetUp: 0 };
  for (const n of recent.data ?? []) {
    if (n.status === "sent") counts.sent++;
    else if (n.status === "pending") counts.retrying++;
    else counts.failed++;
  }
  const { count: notSetUp } = await sb.from("notifications")
    .select("id", { count: "exact", head: true }).gte("created_at", since).like("last_error", "%isn't set up yet%");
  counts.notSetUp = notSetUp ?? 0;
  counts.failed -= counts.notSetUp;
  return NextResponse.json({
    sms: { connected: !!smsProvider(), provider: smsProvider() },
    email: { connected: isEmailConfigured(), from: process.env.SMTP_USER ?? null },
    cronSecretSet: (process.env.CRON_SECRET ?? "").length >= 16,
    worker: worker.data ? { lastRun: worker.data.updated_at, result: worker.data.value } : null,
    calls: (calls.data ?? []).map((c: any) => ({ at: c.called_at, status: c.status_code, error: c.error })),
    last24h: counts,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await ownerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const body = await request.json().catch(() => ({}));
  const { channel } = body;
  const { data: me } = await ctx.sb.from("employees").select("first_name, phone, email").eq("id", ctx.employee.id).maybeSingle();
  if (body.template) return sendSample(ctx.sb, me, body);
  const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

  if (channel === "sms") {
    if (!me?.phone) return NextResponse.json({ error: "Add a phone number to your employee profile first." }, { status: 400 });
    const [r] = await enqueue(ctx.sb, [{
      channel: "sms", audience: "staff", kind: "test", to: me.phone,
      text: `Volt test text — sent from Settings at ${when} ET. Texting works!`,
    }]);
    return NextResponse.json(r.sent ? { ok: true, to: me.phone } : { error: r.error ?? "The text didn't send." }, { status: r.sent ? 200 : 502 });
  }
  if (channel === "email") {
    if (!isDeliverableEmail(me?.email)) return NextResponse.json({ error: "Add an email address to your employee profile first." }, { status: 400 });
    const { business } = await loadAppSettings();
    const text = `Hi ${me!.first_name}, this test email was sent from Volt's Settings page at ${when} ET. Email works!`;
    const [r] = await enqueue(ctx.sb, [{
      channel: "email", audience: "staff", kind: "test", to: me!.email,
      subject: "Volt test email", text, html: emailHtml("Test email", text, undefined, business),
    }]);
    return NextResponse.json(r.sent ? { ok: true, to: me!.email } : { error: r.error ?? "The email didn't send." }, { status: r.sent ? 200 : 502 });
  }
  return NextResponse.json({ error: "Choose text or email." }, { status: 400 });
}

// ── Sample customer messages (Settings → Message Wording) ────────────────────
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

async function sendSample(sb: any, me: any, body: any) {
  const info = TEMPLATES.find((t) => t.key === body.template);
  if (!info) return NextResponse.json({ error: "Unknown message." }, { status: 400 });
  const key = info.key as TemplateKey;
  const { data: saved } = await sb.from("message_templates").select("*").eq("key", key).maybeSingle();
  const base = mergeTemplate(key, saved);
  // The wording on screen (maybe unsaved), else what's saved, else the default.
  const text = {
    sms: clip(body.sms, 1600) ?? base.sms,
    emailSubject: clip(body.emailSubject, 300) ?? base.emailSubject,
    emailBody: clip(body.emailBody, 5000) ?? base.emailBody,
  };
  const settings = await loadAppSettings();
  const home = appUrl();
  // Tip / review links open sample versions of those pages (nothing charged or saved).
  const links = sampleLinks(home, me?.first_name);
  const vars = {
    ...info.sample,
    phone: settings.business.phone,
    arrive_minutes: String(settings.arriveEarlyMinutes),
    name: me?.first_name || info.sample.name,
    // Other links go to the homepage — there's no real booking behind a sample.
    ...Object.fromEntries(Object.keys(info.sample).filter((k) => k.endsWith("_link")).map((k) => [k, home])),
    tip_link: links.tip,
    review_link: links.review,
  };

  if (body.channel === "sms") {
    if (info.hasSms === false) return NextResponse.json({ error: "This message is email only." }, { status: 400 });
    if (!me?.phone) return NextResponse.json({ error: "Add a phone number to your employee profile first." }, { status: 400 });
    const sms = renderTemplate(text.sms, vars).trim();
    if (!sms) return NextResponse.json({ error: "This message has no text wording." }, { status: 400 });
    const [r] = await enqueue(sb, [{ channel: "sms", audience: "staff", kind: `sample:${key}`, to: me.phone, text: `[Sample] ${sms}` }]);
    return NextResponse.json(r.sent ? { ok: true, to: me.phone } : { error: r.error ?? "The text didn't send." }, { status: r.sent ? 200 : 502 });
  }

  if (body.channel === "email") {
    if (!info.hasEmail) return NextResponse.json({ error: "This message is text only." }, { status: 400 });
    if (!isDeliverableEmail(me?.email)) return NextResponse.json({ error: "Add an email address to your employee profile first." }, { status: 400 });
    const subject = renderTemplate(text.emailSubject, vars).trim();
    const message = renderTemplate(text.emailBody, vars).trim();
    if (!subject || !message) return NextResponse.json({ error: "This message has no email wording." }, { status: 400 });
    // Same buttons customers get: reminders have none, the thank-you has two,
    // everything else links the receipt.
    const reminder = key === "reminder_first" || key === "reminder_second";
    const html = key === "review_request"
      ? emailHtml(subject, message, { label: "Tip your driver", url: links.tip }, settings.business,
        { text: "", label: "Leave a review", url: links.review, asButton: true })
      : emailHtml(subject.split(" — ")[0], message,
        reminder ? undefined : { label: "View receipt", url: home }, settings.business);
    const [r] = await enqueue(sb, [{
      channel: "email", audience: "staff", kind: `sample:${key}`, to: me.email,
      subject: `[Sample] ${subject}`, text: message, html,
    }]);
    return NextResponse.json(r.sent ? { ok: true, to: me.email } : { error: r.error ?? "The email didn't send." }, { status: r.sent ? 200 : 502 });
  }
  return NextResponse.json({ error: "Choose text or email." }, { status: 400 });
}
