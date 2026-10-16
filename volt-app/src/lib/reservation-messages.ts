// ─── Messages about a reservation (server-only) ──────────────────────────────
// Builds the customer texts and emails — confirmation, receipt, "your booking
// changed", cancellation, trip reminders — from the wording in Dashboard →
// Settings → Message Wording (src/lib/message-templates.ts), and sends them
// through the message queue (src/lib/notifications/queue.ts), which records
// and retries each one.

import { emailHtml, isDeliverableEmail } from "@/lib/notifications/email";
import { enqueue } from "@/lib/notifications/queue";
import { easternToday, formatDateLong, formatDateShort, formatTime12h } from "@/lib/format";
import { loadAppSettings } from "@/lib/settings-server";
import {
  DEFAULT_TEMPLATES, mergeTemplate, renderTemplate, TEMPLATES,
  type TemplateKey, type TemplateOverride, type TemplateText,
} from "@/lib/message-templates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  return (url && url.startsWith("http") ? url : "https://volt-transportation.com").replace(/\/$/, "");
}

export function receiptUrl(token: string): string {
  return `${appUrl()}/receipt/${token}`;
}

export interface MessageInfo {
  id: string;
  confirmationNumber: string;
  receiptToken: string;
  phone: string;
  email: string;
  firstName: string;
  outbound: { date: string; time: string; from: string; to: string } | null;
  ret: { date: string; time: string } | null;
}

export async function loadMessageInfo(sb: Db, reservationId: string): Promise<MessageInfo | null> {
  const { data: r } = await sb
    .from("reservations")
    .select(
      "id, confirmation_number, receipt_token, is_round_trip, " +
      "customer:customers(first_name, phone, email), " +
      "trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(origin_label, destination_label)), " +
      "return_trip:trips!reservations_return_trip_id_fkey(departure_date, departure_time)",
    )
    .eq("id", reservationId)
    .maybeSingle();
  if (!r) return null;
  return {
    id: r.id,
    confirmationNumber: r.confirmation_number,
    receiptToken: r.receipt_token,
    phone: r.customer?.phone ?? "",
    email: r.customer?.email ?? "",
    firstName: r.customer?.first_name ?? "",
    outbound: r.trip
      ? {
          date: r.trip.departure_date,
          time: r.trip.departure_time,
          from: r.trip.route?.origin_label ?? "",
          to: r.trip.route?.destination_label ?? "",
        }
      : null,
    ret: r.is_round_trip && r.return_trip
      ? { date: r.return_trip.departure_date, time: r.return_trip.departure_time }
      : null,
  };
}

// ── Wording ───────────────────────────────────────────────────────────────────
const TEMPLATE_TTL_MS = 15_000;
// Shared across separately bundled routes (see settings-server.ts).
const g = globalThis as unknown as { __voltTemplateCache?: { at: number; value: Record<TemplateKey, TemplateText> } | null };

export function invalidateTemplateCache() {
  g.__voltTemplateCache = null;
}

/** Current wording for every message (saved overrides on top of the defaults). */
export async function loadTemplates(sb: Db): Promise<Record<TemplateKey, TemplateText>> {
  const templateCache = g.__voltTemplateCache;
  if (templateCache && Date.now() - templateCache.at < TEMPLATE_TTL_MS) return templateCache.value;
  const value = { ...DEFAULT_TEMPLATES };
  try {
    const { data } = await sb.from("message_templates").select("key, sms_body, email_subject, email_body");
    for (const t of TEMPLATES) {
      value[t.key] = mergeTemplate(t.key, (data ?? []).find((o: TemplateOverride) => o.key === t.key));
    }
  } catch (err) {
    console.error("[reservation-messages] could not load wording — using defaults", err);
  }
  g.__voltTemplateCache = { at: Date.now(), value };
  return value;
}

export interface RenderedMessage {
  sms: string;
  emailSubject: string;
  emailBody: string;
}

/** Render one message type with these values (plus Volt's phone + arrive-early minutes). */
export async function renderMessage(
  sb: Db, key: TemplateKey, vars: Record<string, string | number | null | undefined>,
): Promise<RenderedMessage> {
  const [templates, settings] = await Promise.all([loadTemplates(sb), loadAppSettings()]);
  const t = templates[key];
  const all = { phone: settings.business.phone, arrive_minutes: settings.arriveEarlyMinutes, ...vars };
  return {
    sms: renderTemplate(t.sms, all),
    emailSubject: renderTemplate(t.emailSubject, all),
    emailBody: renderTemplate(t.emailBody, all),
  };
}

function baseVars(info: MessageInfo) {
  return { name: info.firstName, confirmation: info.confirmationNumber, receipt_link: receiptUrl(info.receiptToken) };
}

function tripLine(info: MessageInfo): string {
  if (!info.outbound) return "";
  return `Now: ${formatDateShort(info.outbound.date)} at ${formatTime12h(info.outbound.time)}, ${info.outbound.from} → ${info.outbound.to}` +
    (info.ret ? `\nReturn: ${formatDateShort(info.ret.date)} at ${formatTime12h(info.ret.time)}` : "");
}

export function confirmationMessage(sb: Db, info: MessageInfo) {
  return renderMessage(sb, "confirmation", {
    ...baseVars(info),
    route: info.outbound ? `${info.outbound.from} → ${info.outbound.to}` : "",
    date: info.outbound ? formatDateLong(info.outbound.date) : "",
    time: info.outbound ? formatTime12h(info.outbound.time) : "",
    return_line: info.ret ? `Return: ${formatDateShort(info.ret.date)} at ${formatTime12h(info.ret.time)}` : "",
  });
}

export function receiptMessage(sb: Db, info: MessageInfo) {
  return renderMessage(sb, "receipt", baseVars(info));
}

export function updatedMessage(sb: Db, info: MessageInfo, changes: string[]) {
  return renderMessage(sb, "updated", {
    ...baseVars(info),
    changes: changes.length ? `Changed: ${changes.slice(0, 4).join("; ")}${changes.length > 4 ? "…" : ""}` : "",
    trip_line: tripLine(info),
  });
}

export function cancelledMessage(sb: Db, info: MessageInfo, refundDetails: string) {
  return renderMessage(sb, "cancelled", { ...baseVars(info), refund_details: refundDetails });
}

/** "tomorrow" / "today" / "on Friday" for a departure date. */
export function whenWords(date: string): string {
  const today = easternToday();
  const tomorrow = easternToday(new Date(Date.now() + 86_400_000));
  if (date === today) return "today";
  if (date === tomorrow) return "tomorrow";
  return `on ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}`;
}

export function reminderMessage(
  sb: Db, which: "first" | "second",
  r: { firstName: string; confirmationNumber: string; date: string; time: string; from: string; hoursBefore: number },
) {
  return renderMessage(sb, which === "first" ? "reminder_first" : "reminder_second", {
    name: r.firstName,
    confirmation: r.confirmationNumber,
    when: whenWords(r.date),
    time: formatTime12h(r.time),
    from: r.from,
    hours: `${r.hoursBefore} hour${r.hoursBefore === 1 ? "" : "s"}`,
  });
}

// ── Sending ───────────────────────────────────────────────────────────────────
export interface TextResult {
  sent: boolean;
  simulated: boolean;
  error?: string;
}

/** Text the customer on file (queued + logged). Never throws. */
export async function sendReservationText(
  sb: Db,
  info: MessageInfo,
  message: string,
  kind: string | null = null,
): Promise<TextResult> {
  if (!info.phone) return { sent: false, simulated: false, error: "No phone number on this reservation." };
  const [r] = await enqueue(sb, [{ channel: "sms", to: info.phone, text: message, reservationId: info.id, kind }]);
  return { sent: r.sent, simulated: r.simulated, error: r.error };
}

/** Email the customer on file (queued + logged), with a receipt button. Never throws. */
export async function sendReservationEmail(
  sb: Db,
  info: MessageInfo,
  msg: { subject: string; body: string },
  kind: string | null = null,
): Promise<TextResult> {
  if (!isDeliverableEmail(info.email)) return { sent: false, simulated: false, error: "No email address on this reservation." };
  if (!msg.subject || !msg.body) return { sent: false, simulated: false, error: "This message has no email wording." };
  const { business } = await loadAppSettings();
  const link = receiptUrl(info.receiptToken);
  const [r] = await enqueue(sb, [{
    channel: "email",
    to: info.email,
    subject: msg.subject,
    text: `${msg.body}\n\nView your receipt: ${link}`,
    html: emailHtml(msg.subject.split(" — ")[0], msg.body, { label: "View receipt", url: link }, business),
    reservationId: info.id,
    kind: kind ? `email_${kind}` : null,
  }]);
  return { sent: r.sent, simulated: r.simulated, error: r.error };
}

async function textAndEmail(sb: Db, info: MessageInfo, m: RenderedMessage, kind: string | null) {
  await sendReservationText(sb, info, m.sms, kind);
  await sendReservationEmail(sb, info, { subject: m.emailSubject, body: m.emailBody }, kind);
}

/** Booking confirmed — text + email. */
export async function notifyConfirmation(sb: Db, info: MessageInfo, kind = "confirmation"): Promise<void> {
  await textAndEmail(sb, info, await confirmationMessage(sb, info), kind);
}

/** Booking changed — text + email. */
export async function notifyUpdated(sb: Db, info: MessageInfo, changes: string[], kind: string | null = "updated"): Promise<void> {
  await textAndEmail(sb, info, await updatedMessage(sb, info, changes), kind);
}

/** Booking cancelled — text + email. `refundDetails` explains the money. */
export async function notifyCancelled(sb: Db, info: MessageInfo, refundDetails: string): Promise<void> {
  await textAndEmail(sb, info, await cancelledMessage(sb, info, refundDetails), "cancelled");
}
