// ─── Texts about a reservation (server-only) ─────────────────────────────────
// Builds and sends the customer texts — confirmation, receipt link, "your
// booking changed" — and records each one in `notifications`.

import { sendSMS, SMS_TEMPLATES } from "@/lib/notifications/sms";
import { formatDateLong, formatDateShort, formatTime12h } from "@/lib/format";

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
  firstName: string;
  outbound: { date: string; time: string; from: string; to: string } | null;
  ret: { date: string; time: string } | null;
}

export async function loadMessageInfo(sb: Db, reservationId: string): Promise<MessageInfo | null> {
  const { data: r } = await sb
    .from("reservations")
    .select(
      "id, confirmation_number, receipt_token, is_round_trip, " +
      "customer:customers(first_name, phone), " +
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

export function confirmationText(info: MessageInfo): string {
  return SMS_TEMPLATES.bookingConfirmation({
    confirmationNumber: info.confirmationNumber,
    date: info.outbound ? formatDateLong(info.outbound.date) : "",
    time: info.outbound ? formatTime12h(info.outbound.time) : "",
    from: info.outbound?.from ?? "",
    to: info.outbound?.to ?? "",
    passengerName: info.firstName,
    returnLine: info.ret ? `Return: ${formatDateShort(info.ret.date)} at ${formatTime12h(info.ret.time)}` : undefined,
    receiptUrl: receiptUrl(info.receiptToken),
  });
}

export function receiptText(info: MessageInfo): string {
  return SMS_TEMPLATES.receiptLink({
    confirmationNumber: info.confirmationNumber,
    receiptUrl: receiptUrl(info.receiptToken),
    passengerName: info.firstName,
  });
}

export function updatedText(info: MessageInfo, changes: string[]): string {
  const trip = info.outbound
    ? `Now: ${formatDateShort(info.outbound.date)} at ${formatTime12h(info.outbound.time)}, ${info.outbound.from} → ${info.outbound.to}` +
      (info.ret ? `\nReturn: ${formatDateShort(info.ret.date)} at ${formatTime12h(info.ret.time)}` : "")
    : "";
  const what = changes.length ? `Changed: ${changes.slice(0, 4).join("; ")}${changes.length > 4 ? "…" : ""}\n` : "";
  return SMS_TEMPLATES.reservationUpdated({
    confirmationNumber: info.confirmationNumber,
    change: `${what}${trip}`.trim(),
    receiptUrl: receiptUrl(info.receiptToken),
  });
}

export interface TextResult {
  sent: boolean;
  simulated: boolean;
  error?: string;
}

/** Send a text to the customer on file and log it. Never throws. */
export async function sendReservationText(
  sb: Db,
  info: MessageInfo,
  message: string,
  kind: string | null = null,
): Promise<TextResult> {
  if (!info.phone) return { sent: false, simulated: false, error: "No phone number on this reservation." };
  try {
    const result = await sendSMS(info.phone, message);
    await sb.from("notifications").insert({
      reservation_id: info.id,
      type: "sms",
      recipient: info.phone,
      message,
      status: result.success ? "sent" : "failed",
      provider_id: result.sid ?? null,
      kind,
    });
    return { sent: result.success, simulated: !!result.simulated, error: result.error };
  } catch (err) {
    console.error("[reservation-messages] text failed", err);
    return { sent: false, simulated: false, error: "The text could not be sent." };
  }
}
