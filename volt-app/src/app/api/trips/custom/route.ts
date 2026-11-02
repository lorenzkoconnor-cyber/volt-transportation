import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { CUSTOM_BOOKING_ROLES, easternInstant } from "@/lib/staff-pricing";
import { arrivalFor, displayTime12h, type DepartureSlot } from "@/lib/booking";
import { loadAppSettings } from "@/lib/settings-server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HALF_HOUR_RE = /^([01]\d|2[0-3]):(00|30)$/;

// POST /api/trips/custom — owners/managers only.
// Body: { from: "columbus" | "atl", to, date: "2026-11-05", time: "15:30", private?: boolean }
// Finds the departure at that date/time (any half hour), creating it if it
// doesn't exist. Off-schedule times become custom departures (never sold
// online); `private` keeps every other rider off it. → { slot: DepartureSlot }
export async function POST(request: NextRequest) {
  const ctx = await requireStaff(CUSTOM_BOOKING_ROLES);
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

  try {
    const body = await request.json();
    const date = String(body.date ?? "");
    const time = String(body.time ?? "");
    const makePrivate = !!body.private;
    if (!DATE_RE.test(date)) return bad("Pick a date.");
    if (!HALF_HOUR_RE.test(time)) return bad("Pick a time on the hour or half hour.");
    const departsAt = easternInstant(date, time);
    if (departsAt <= Date.now()) return bad("That time has already passed.");

    const { data: route } = await sb.from("routes")
      .select("id, origin_key, duration_minutes")
      .eq("origin_key", String(body.from ?? "")).eq("destination_key", String(body.to ?? "")).eq("is_active", true)
      .maybeSingle();
    if (!route) return bad("Unknown route.");

    // Service pauses (Settings → Blackouts) apply to custom departures too.
    const iso = new Date(departsAt).toISOString();
    const { data: pauses } = await sb.from("service_blackouts")
      .select("direction, reason").is("removed_at", null).lte("starts_at", iso).gt("ends_at", iso);
    const dir = route.origin_key === "atl" ? "from_atl" : "to_atl";
    const pause = (pauses ?? []).find((b: any) => b.direction === "both" || b.direction === dir);
    if (pause) return bad(`Service is paused then${pause.reason ? ` (${pause.reason})` : ""}. Remove the blackout in Settings first.`);

    const fields = "id, departure_date, departure_time, status, total_capacity, seats_booked, is_custom, is_private";
    let { data: trip } = await sb.from("trips").select(fields)
      .eq("route_id", route.id).eq("departure_date", date).eq("departure_time", time).maybeSingle();

    if (trip && trip.status === "cancelled") return bad("That departure was cancelled. Pick another time or reopen it in Dispatch.");
    if (trip && !["scheduled", "boarding"].includes(trip.status)) return bad("That departure isn't taking bookings.");

    if (!trip) {
      const settings = await loadAppSettings();
      const { data: created, error } = await sb.from("trips")
        .insert({
          route_id: route.id, departure_date: date, departure_time: time,
          total_capacity: settings.defaultVanCapacity, seats_booked: 0, status: "scheduled",
          is_private: makePrivate,
          notes: `Added by ${ctx.employee.name}`,
        })
        .select(fields)
        .single();
      if (error || !created) {
        // Someone else created it at the same moment — use theirs.
        ({ data: trip } = await sb.from("trips").select(fields)
          .eq("route_id", route.id).eq("departure_date", date).eq("departure_time", time).maybeSingle());
        if (!trip) throw error ?? new Error("Trip insert failed");
      } else {
        trip = created;
      }
    } else if (makePrivate && !trip.is_private) {
      if (trip.seats_booked > 0) return bad("Other riders are already booked on that departure, so it can't be made private.");
      const { data: updated } = await sb.from("trips").update({ is_private: true }).eq("id", trip.id).eq("seats_booked", 0)
        .select(fields).maybeSingle();
      if (!updated) return bad("Someone just booked that departure, so it can't be made private.");
      trip = updated;
    }

    const t = trip!;
    const hhmm = t.departure_time.slice(0, 5);
    const seatsLeft = t.total_capacity - t.seats_booked;
    const slot: DepartureSlot = {
      id: t.id,
      date: t.departure_date,
      time: hhmm,
      displayTime: displayTime12h(hhmm),
      ...arrivalFor(t.departure_date, hhmm, route.duration_minutes ?? 120),
      available: seatsLeft > 0 && !(t.is_private && t.seats_booked > 0),
      seatsLeft,
      totalSeats: t.total_capacity,
      custom: t.is_custom,
      private: t.is_private,
    };
    return NextResponse.json({ slot });
  } catch (err) {
    console.error("[trips/custom]", err);
    return bad("Could not set up that departure.", 500);
  }
}
