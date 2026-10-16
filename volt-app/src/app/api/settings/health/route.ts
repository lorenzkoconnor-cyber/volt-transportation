import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { smsProvider } from "@/lib/notifications/sms";
import { isDeliverableEmail, isEmailConfigured, emailHtml } from "@/lib/notifications/email";
import { enqueue } from "@/lib/notifications/queue";
import { loadAppSettings } from "@/lib/settings-server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Settings → Message Health (owners/managers).
// GET  → is texting/email connected, when the background worker last ran (and
//        what Supabase got back calling it), and the last day's outbox counts.
// POST { channel: "sms" | "email" } → send a test to the signed-in employee.

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
  const { channel } = await request.json().catch(() => ({}));
  const { data: me } = await ctx.sb.from("employees").select("first_name, phone, email").eq("id", ctx.employee.id).maybeSingle();
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
