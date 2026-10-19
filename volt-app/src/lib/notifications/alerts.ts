// ─── Staff alerts (server-only) ───────────────────────────────────────────────
// raiseStaffAlert() texts and/or emails every employee subscribed to an alert
// type (Dashboard → Settings → Staff alerts), through the message queue.
// Each alert has a `key`; the same key never alerts the same person twice.
//
// Event alerts are raised where the event happens (short-notice booking,
// online cancellation, failed customer message). The rest are found by
// runAlertScans(), which the cron worker calls every 10 minutes.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { loadAppSettings } from "@/lib/settings-server";
import { enqueue, type QueueItem } from "@/lib/notifications/queue";
import { emailHtml, isDeliverableEmail } from "@/lib/notifications/email";
import { isSmsConfigured } from "@/lib/notifications/sms";
import { getStripeServer } from "@/lib/stripe/server";
import { easternInstant } from "@/lib/staff-pricing";
import { formatDateShort, formatTime12h } from "@/lib/format";
import { ALERT_TYPES, type AlertType } from "@/lib/alert-types";
import { appUrl } from "@/lib/reservation-messages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const DEFAULT_SHORT_NOTICE_HOURS = 6;
const HOLD_WARN_MS = 2 * 86_400_000;
const STUCK_PAYMENT_MS = 15 * 60_000;
export const STAFF_TRIP_REMINDER_MS = 2 * 3_600_000;

export interface AlertContent {
  key: string;      // unique per occurrence, e.g. "reservation:<id>"
  subject: string;  // email subject; also the first line of the text
  text: string;
  link?: string;    // dashboard link for the button / end of the text
}

/** Send an alert to everyone subscribed to `type`. Never throws. */
export async function raiseStaffAlert(sb: Db, type: AlertType, alert: AlertContent): Promise<void> {
  try {
    const { data: subs } = await sb
      .from("staff_alert_subscriptions")
      .select("via_sms, via_email, employee:employees(id, first_name, email, phone, is_active)")
      .eq("alert_type", type);

    const label = ALERT_TYPES.find((a) => a.type === type)?.label ?? type;
    const link = alert.link ? `${appUrl()}${alert.link}` : null;
    // Until texting is set up, anyone who chose text gets the alert by email instead.
    const smsReady = isSmsConfigured();
    const items: QueueItem[] = [];
    for (const s of subs ?? []) {
      const e = s.employee;
      if (!e?.is_active) continue;
      const base = { audience: "staff" as const, kind: `alert:${type}` };
      if (s.via_sms && e.phone) {
        items.push({
          ...base,
          channel: "sms",
          to: e.phone,
          text: `Volt alert — ${alert.subject}\n\n${alert.text}${link ? `\n\n${link}` : ""}`.slice(0, 1200),
          dedupeKey: `alert:${type}:${alert.key}:${e.id}:sms`,
        });
      }
      if ((s.via_email || (s.via_sms && !smsReady)) && isDeliverableEmail(e.email)) {
        items.push({
          ...base,
          channel: "email",
          to: e.email,
          subject: `[Volt alert] ${alert.subject}`,
          text: `${alert.text}${link ? `\n\nOpen in the dashboard: ${link}` : ""}\n\n— ${label} alert. Change who gets these under Dashboard → Settings.`,
          html: emailHtml(alert.subject, `${alert.text}\n\n— ${label} alert. Change who gets these under Dashboard → Settings.`,
            link ? { label: "Open in dashboard", url: link } : undefined, (await loadAppSettings()).business),
          dedupeKey: `alert:${type}:${alert.key}:${e.id}:email`,
        });
      }
    }
    if (items.length) await enqueue(sb, items);
  } catch (err) {
    console.error(`[alerts] could not raise ${type}`, err);
  }
}

// ── Event alerts ──────────────────────────────────────────────────────────────

async function loadReservationSummary(sb: Db, reservationId: string) {
  const { data: r } = await sb
    .from("reservations")
    .select(
      "id, confirmation_number, adults, children, pets, is_round_trip, created_by_employee_id, special_notes, " +
      "customer:customers(first_name, last_name, phone), " +
      "trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(origin_label, destination_label))",
    )
    .eq("id", reservationId)
    .maybeSingle();
  return r;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describe(r: any): string {
  const name = [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ") || "Customer";
  const seats = (r.adults ?? 0) + (r.children ?? 0);
  const trip = r.trip
    ? `${r.trip.route?.origin_label ?? ""} → ${r.trip.route?.destination_label ?? ""}, ${formatDateShort(r.trip.departure_date)} at ${formatTime12h(r.trip.departure_time)}`
    : "";
  return (
    `${r.confirmation_number} · ${name}${r.customer?.phone ? ` · ${r.customer.phone}` : ""}\n` +
    `${seats} seat${seats === 1 ? "" : "s"}${r.pets ? `, ${r.pets} pet${r.pets === 1 ? "" : "s"}` : ""}${r.is_round_trip ? " · round trip" : ""}\n` +
    trip +
    (r.special_notes ? `\nNotes: ${String(r.special_notes).slice(0, 200)}` : "")
  );
}

/** Raise "short-notice booking" if this new booking's first ride leaves soon. */
export async function alertIfShortNotice(sb: Db, reservationId: string): Promise<void> {
  try {
    const r = await loadReservationSummary(sb, reservationId);
    if (!r?.trip) return;
    const { data: settings } = await sb.from("booking_settings").select("short_notice_hours").maybeSingle();
    const hours = settings?.short_notice_hours ?? DEFAULT_SHORT_NOTICE_HOURS;
    const leavesIn = easternInstant(r.trip.departure_date, r.trip.departure_time.slice(0, 5)) - Date.now();
    if (leavesIn > hours * 3_600_000 || leavesIn < -3_600_000) return;
    const mins = Math.max(0, Math.round(leavesIn / 60_000));
    const when = mins >= 120 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    await raiseStaffAlert(sb, "short_notice_booking", {
      key: `reservation:${reservationId}`,
      subject: `Short-notice booking — leaves in ${when}`,
      text: `${r.created_by_employee_id ? "Staff" : "Online"} booking:\n${describe(r)}`,
      link: `/dashboard/reservations/${reservationId}`,
    });
  } catch (err) {
    console.error("[alerts] short-notice check failed", err);
  }
}

/** Raise "online cancellation". */
export async function alertOnlineCancellation(sb: Db, reservationId: string, refundNote: string): Promise<void> {
  const r = await loadReservationSummary(sb, reservationId);
  if (!r) return;
  await raiseStaffAlert(sb, "online_cancellation", {
    key: `reservation:${reservationId}`,
    subject: `Online cancellation — ${r.confirmation_number}`,
    text: `${describe(r)}\n\n${refundNote}`,
    link: `/dashboard/reservations/${reservationId}`,
  });
}

// ── Scans (cron) ──────────────────────────────────────────────────────────────

export async function runAlertScans(sb: Db): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const [name, scan] of [
    ["holds", scanExpiringHolds],
    ["capacity", scanVanCapacity],
    ["payments", scanPaymentsWithoutReservation],
  ] as const) {
    try {
      out[name] = await scan(sb);
    } catch (err) {
      console.error(`[alerts] ${name} scan failed`, err);
      out[name] = "error";
    }
  }
  return out;
}

async function scanExpiringHolds(sb: Db): Promise<number> {
  const { data } = await sb
    .from("payments")
    .select("id, amount_cents, authorization_expires_at, reservation:reservations(id, confirmation_number, status)")
    .eq("status", "authorized")
    .not("authorization_expires_at", "is", null)
    .lte("authorization_expires_at", new Date(Date.now() + HOLD_WARN_MS).toISOString());
  let n = 0;
  for (const p of data ?? []) {
    if (!p.reservation || p.reservation.status === "cancelled") continue;
    const expires = new Date(p.authorization_expires_at);
    const expired = expires.getTime() <= Date.now();
    await raiseStaffAlert(sb, "hold_expiring", {
      key: `payment:${p.id}`,
      subject: `${expired ? "Card hold EXPIRED" : "Card hold expires soon"} — ${p.reservation.confirmation_number}`,
      text:
        `The Military Discount card hold on ${p.reservation.confirmation_number} ` +
        `${expired ? "has expired" : `expires ${expires.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}.\n` +
        `Settle it in Verifications (Approve, Reject, or Can't verify) before it lapses, or the fare can't be collected.`,
      link: "/dashboard/verifications",
    });
    n++;
  }
  return n;
}

// Staff trip reminders: about 2 hours before each departure that has riders,
// subscribed staff get the rider count, van and driver; the assigned driver
// (if they have an email and aren't already subscribed) is emailed too.
export async function scanStaffTripReminders(sb: Db): Promise<number> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data } = await sb
    .from("trips")
    .select(
      "id, departure_date, departure_time, total_capacity, seats_booked, route:routes(origin_label, destination_label), " +
      "trip_vehicles(vehicle:vehicles(name), driver:drivers(id, employee_id, first_name, last_name, email, phone))",
    )
    .in("status", ["scheduled", "boarding"])
    .gt("seats_booked", 0)
    .gte("departure_date", today)
    .lte("departure_date", tomorrow);

  let subscribed: Set<string> | null = null;
  let n = 0;
  for (const t of data ?? []) {
    const msUntil = easternInstant(t.departure_date, t.departure_time.slice(0, 5)) - Date.now();
    if (msUntil > STAFF_TRIP_REMINDER_MS || msUntil < 15 * 60_000) continue;

    const route = `${t.route?.origin_label ?? ""} → ${t.route?.destination_label ?? ""}`;
    const when = `${formatDateShort(t.departure_date)} at ${formatTime12h(t.departure_time)}`;
    const vans = (t.trip_vehicles ?? []) as { vehicle: { name: string } | null; driver: Record<string, string> | null }[];
    const vanLines = vans.length
      ? vans.map((v) => `Van: ${v.vehicle?.name ?? "—"} · Driver: ${v.driver ? `${v.driver.first_name} ${v.driver.last_name}` : "not assigned"}`).join("\n")
      : "No van or driver assigned yet — assign one in Dispatch.";
    const text = `${route}, ${when}.\n${t.seats_booked} of ${t.total_capacity} seats booked.\n${vanLines}`;
    const link = `/dashboard/manifest?tripId=${t.id}`;
    const subject = `Departure in about ${Math.max(1, Math.round(msUntil / 3_600_000))} hr — ${formatTime12h(t.departure_time)} ${t.route?.origin_label ?? ""}`;

    await raiseStaffAlert(sb, "trip_reminder", { key: `trip:${t.id}`, subject, text, link });

    if (!subscribed) {
      const { data: subs } = await sb.from("staff_alert_subscriptions").select("employee_id").eq("alert_type", "trip_reminder");
      subscribed = new Set((subs ?? []).map((s: { employee_id: string }) => s.employee_id));
    }
    const { business } = await loadAppSettings();
    const driverItems: QueueItem[] = [];
    for (const v of vans) {
      const d = v.driver;
      if (!d || !isDeliverableEmail(d.email) || (d.employee_id && subscribed.has(d.employee_id))) continue;
      driverItems.push({
        channel: "email",
        audience: "staff",
        kind: "alert:trip_reminder",
        to: d.email,
        subject: `[Volt] Your trip: ${subject}`,
        text: `Hi ${d.first_name}, you're driving ${route}, ${when}.\n${t.seats_booked} riders booked. Van: ${v.vehicle?.name ?? "—"}.\n\nBoarding list: ${appUrl()}${link}`,
        html: emailHtml(`Your trip — ${when}`,
          `Hi ${d.first_name}, you're driving ${route}, ${when}.\n${t.seats_booked} riders booked. Van: ${v.vehicle?.name ?? "—"}.`,
          { label: "Open boarding list", url: `${appUrl()}${link}` }, business),
        dedupeKey: `alert:trip_reminder:trip:${t.id}:driver:${d.id}:email`,
      });
    }
    if (driverItems.length) await enqueue(sb, driverItems);
    n++;
  }
  return n;
}

async function scanVanCapacity(sb: Db): Promise<number> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const until = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data } = await sb
    .from("trips")
    .select("id, departure_date, departure_time, total_capacity, seats_booked, route:routes(origin_label, destination_label)")
    .in("status", ["scheduled", "boarding"])
    .gte("departure_date", today)
    .lte("departure_date", until);
  let n = 0;
  for (const t of data ?? []) {
    if (t.seats_booked < t.total_capacity) continue;
    if (easternInstant(t.departure_date, t.departure_time.slice(0, 5)) < Date.now()) continue;
    const over = t.seats_booked > t.total_capacity;
    await raiseStaffAlert(sb, "van_capacity", {
      key: `trip:${t.id}:${over ? `over:${t.seats_booked}` : "full"}`,
      subject: over
        ? `Van OVER capacity — ${t.seats_booked}/${t.total_capacity} seats`
        : `Van fully booked — ${t.total_capacity} seats`,
      text:
        `${t.route?.origin_label ?? ""} → ${t.route?.destination_label ?? ""}, ${formatDateShort(t.departure_date)} at ${formatTime12h(t.departure_time)}.\n` +
        (over
          ? "More riders are booked than the van has seats. Add a vehicle or move riders in Dispatch."
          : "Online booking for this departure is now closed. Consider adding a second van if demand continues."),
      link: "/dashboard/dispatch",
    });
    n++;
  }
  return n;
}

// Cards charged (or on hold) in the last 2 days with nothing recorded for them:
// a customer checkout that never became a reservation, or a staff card payment
// still marked unpaid. Customer checkouts get one more finalize attempt first.
async function scanPaymentsWithoutReservation(sb: Db): Promise<number> {
  const stripe = getStripeServer();
  if (!stripe) return 0;
  const cutoff = Math.floor((Date.now() - STUCK_PAYMENT_MS) / 1000);
  const list = await stripe.paymentIntents.list({
    created: { gte: Math.floor((Date.now() - 2 * 86_400_000) / 1000), lte: cutoff },
    limit: 100,
    expand: ["data.latest_charge"],
  });
  let n = 0;
  for (const pi of list.data) {
    if (pi.status !== "succeeded" && pi.status !== "requires_capture") continue;
    const charge = typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge | null) : null;
    if (charge?.refunded) continue;

    const checkoutId = pi.metadata?.checkout_id;
    const staffPaymentId = pi.metadata?.staff_payment_id;
    let problem: string | null = null;

    if (checkoutId) {
      const { data: checkout } = await sb
        .from("booking_checkouts").select("id, status, error, reservation_id").eq("id", checkoutId).maybeSingle();
      if (!checkout) problem = "No checkout record exists for this payment.";
      else if (checkout.status !== "completed" || !checkout.reservation_id) {
        if (checkout.status !== "failed") {
          // Self-heal: same path the webhook uses.
          const { finalizeCheckout } = await import("@/lib/checkout");
          const res = await finalizeCheckout(checkoutId, pi.id, "webhook").catch((e) => ({ ok: false, error: String(e) }));
          if (res.ok) continue;
          problem = `The booking could not be completed: ${"error" in res ? res.error : "unknown error"}`;
        } else {
          problem = `The checkout failed (${checkout.error ?? "no reason recorded"}) but the card was not refunded.`;
        }
      }
    } else if (staffPaymentId) {
      const { data: pay } = await sb.from("payments").select("id, status, reservation_id").eq("id", staffPaymentId).maybeSingle();
      if (!pay) problem = "The staff card payment has no payment record.";
      else if (pay.status === "pending") problem = "A staff card payment went through but is still marked unpaid.";
    } else {
      continue; // Not created by this app (e.g. made in the Stripe dashboard).
    }
    if (!problem) continue;

    await raiseStaffAlert(sb, "payment_without_reservation", {
      key: `pi:${pi.id}`,
      subject: `Card ${pi.status === "requires_capture" ? "on hold" : "charged"} $${(pi.amount / 100).toFixed(2)} with no booking`,
      text:
        `${problem}\n` +
        `Stripe payment: ${pi.id}\n` +
        `Customer email: ${pi.receipt_email ?? charge?.billing_details?.email ?? "unknown"}\n\n` +
        `Look it up in Stripe, then create the reservation by hand or refund the card.`,
      link: "/dashboard/payments",
    });
    n++;
  }
  return n;
}
