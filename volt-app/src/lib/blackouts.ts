// ─── Blackout dates / service pauses (server-only) ────────────────────────────
// A blackout stops service for a time range (one or both directions):
//   • every departure in the range is set to 'cancelled' (tagged with the
//     blackout), so it disappears from booking;
//   • riders already booked on it are either cancelled with a FULL refund (no
//     fee — Volt cancelled) or told we'll contact them to rebook/refund;
//   • staff get a "service pause" alert listing who was affected.
// Removing a blackout reopens its future departures (cancelled bookings stay
// cancelled). The background worker re-applies active blackouts to newly
// generated trips (enforceBlackouts).

import { easternInstant } from "@/lib/staff-pricing";
import { formatDateShort, formatTime12h } from "@/lib/format";
import { cancelReservation } from "@/lib/cancellation";
import { loadMessageInfo, sendReservationEmail, sendReservationText } from "@/lib/reservation-messages";
import { raiseStaffAlert } from "@/lib/notifications/alerts";
import { loadAppSettings } from "@/lib/settings-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export type BlackoutDirection = "both" | "to_atl" | "from_atl";

export interface BlackoutInput {
  startsAt: string;       // ISO instant
  endsAt: string;         // ISO instant
  direction: BlackoutDirection;
  reason: string;
  cancelBookings: boolean;
}

interface Staff { id: string; role: string; name: string }

const etDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Departures (not already cancelled) inside a time range and direction. */
async function tripsInRange(sb: Db, startsAt: string, endsAt: string, direction: BlackoutDirection, onlyEmpty = false) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  let q = sb
    .from("trips")
    .select("id, departure_date, departure_time, seats_booked, status, route:routes(origin_key, origin_label, destination_label)")
    .gte("departure_date", etDate(start))
    .lte("departure_date", etDate(end))
    .in("status", ["scheduled", "boarding"]);
  if (onlyEmpty) q = q.eq("seats_booked", 0);
  const { data } = await q;
  return (data ?? []).filter((t: any) => {
    const at = easternInstant(t.departure_date, t.departure_time.slice(0, 5));
    if (at < start || at >= end) return false;
    if (direction === "to_atl") return t.route?.origin_key === "columbus";
    if (direction === "from_atl") return t.route?.origin_key === "atl";
    return true;
  });
}

export async function createBlackout(sb: Db, staff: Staff, input: BlackoutInput) {
  const { data: blackout, error } = await sb
    .from("service_blackouts")
    .insert({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      direction: input.direction,
      reason: input.reason,
      cancel_bookings: input.cancelBookings,
      created_by: staff.id,
      created_by_name: staff.name,
    })
    .select("*")
    .single();
  if (error || !blackout) throw error ?? new Error("Could not save the blackout.");

  const trips = await tripsInRange(sb, input.startsAt, input.endsAt, input.direction);
  const tripIds = trips.map((t: any) => t.id);
  if (tripIds.length) {
    await sb.from("trips").update({ status: "cancelled", blackout_id: blackout.id }).in("id", tripIds);
  }

  // Riders booked on any of those departures.
  const affected: { confirmation: string; name: string; phone: string; action: string }[] = [];
  if (tripIds.length) {
    const list = `(${tripIds.join(",")})`;
    const { data: resvs } = await sb
      .from("reservations")
      .select("id, confirmation_number, trip_id, return_trip_id, customer:customers(first_name, last_name, phone)")
      .eq("status", "confirmed")
      .or(`trip_id.in.${list},return_trip_id.in.${list}`);
    const { business } = await loadAppSettings();
    for (const r of resvs ?? []) {
      const trip = trips.find((t: any) => t.id === r.trip_id || t.id === r.return_trip_id);
      const when = trip ? `${formatDateShort(trip.departure_date)} at ${formatTime12h(trip.departure_time)}` : "upcoming";
      const name = [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ");
      if (input.cancelBookings) {
        const res = await cancelReservation(sb, r.id, {
          kind: "staff",
          employee: staff,
          waiveFee: true,
          customerNote: `Volt has paused service for your ${when} ride (${input.reason}), so we've cancelled your reservation.`,
        });
        affected.push({
          confirmation: r.confirmation_number, name, phone: r.customer?.phone ?? "",
          action: res.ok ? `cancelled & refunded${res.problems.length ? ` — ${res.problems.join(" ")}` : ""}` : `not cancelled: ${res.error}`,
        });
      } else {
        const info = await loadMessageInfo(sb, r.id);
        if (info) {
          const text =
            `Volt Transportation: Service change — your ${when} ride (${info.confirmationNumber}) can't run as scheduled: ${input.reason}. ` +
            `We'll contact you to rebook or refund. Questions? Call ${business.phone}.`;
          await sendReservationText(sb, info, text, "service_pause");
          await sendReservationEmail(sb, info, {
            subject: `Service change for your Volt ride — ${info.confirmationNumber}`,
            body:
              `Hi ${info.firstName},\n\nYour ${when} ride (${info.confirmationNumber}) can't run as scheduled: ${input.reason}.\n\n` +
              `We'll contact you shortly to move you to another departure or refund you in full. Questions? Call us at ${business.phone}.`,
          }, "service_pause");
        }
        affected.push({ confirmation: r.confirmation_number, name, phone: r.customer?.phone ?? "", action: "notified — needs rebooking or refund" });
      }
    }
  }

  const summary = { trips: tripIds.length, reservations: affected };
  await sb.from("service_blackouts").update({ affected: summary }).eq("id", blackout.id);

  if (affected.length) {
    await raiseStaffAlert(sb, "service_pause", {
      key: `blackout:${blackout.id}`,
      subject: `Service pause — ${affected.length} booking${affected.length === 1 ? "" : "s"} affected`,
      text:
        `${staff.name} paused service (${input.reason}). ${tripIds.length} departure${tripIds.length === 1 ? "" : "s"} cancelled.\n\n` +
        affected.map((a) => `${a.confirmation} · ${a.name} ${a.phone} — ${a.action}`).join("\n").slice(0, 900),
      link: "/dashboard/reservations",
    });
  }

  return { blackout: { ...blackout, affected: summary }, tripsCancelled: tripIds.length, affected };
}

export async function removeBlackout(sb: Db, staff: Staff, id: string) {
  const { data: b } = await sb.from("service_blackouts").select("*").eq("id", id).maybeSingle();
  if (!b) return { error: "Blackout not found." };
  if (b.removed_at) return { error: "That blackout was already removed." };
  await sb.from("service_blackouts").update({ removed_at: new Date().toISOString(), removed_by_name: staff.name }).eq("id", id);

  // Reopen its departures that haven't happened yet.
  const { data: trips } = await sb
    .from("trips").select("id, departure_date, departure_time").eq("blackout_id", id).eq("status", "cancelled");
  const future = (trips ?? [])
    .filter((t: any) => easternInstant(t.departure_date, t.departure_time.slice(0, 5)) > Date.now())
    .map((t: any) => t.id);
  if (future.length) await sb.from("trips").update({ status: "scheduled", blackout_id: null }).in("id", future);
  return { reopened: future.length };
}

/** Worker: apply active blackouts to departures created after them (empty ones only). */
export async function enforceBlackouts(sb: Db): Promise<number> {
  const { data: active } = await sb
    .from("service_blackouts")
    .select("id, starts_at, ends_at, direction")
    .is("removed_at", null)
    .gt("ends_at", new Date().toISOString());
  let n = 0;
  for (const b of active ?? []) {
    const trips = await tripsInRange(sb, b.starts_at, b.ends_at, b.direction, true);
    const ids = trips.map((t: any) => t.id);
    if (ids.length) {
      await sb.from("trips").update({ status: "cancelled", blackout_id: b.id }).in("id", ids);
      n += ids.length;
    }
  }
  return n;
}
