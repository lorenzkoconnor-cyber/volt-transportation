// ─── Rider tracking page (server-only) ────────────────────────────────────────
// /track/<reservations.track_token> — texted when the driver taps "On the way
// to ATL". Shows where the van probably is, the rider's pickup spot and stop
// order, and lets them tell the driver "I'm outside", "flight delayed", …
// Only this rider's own details are shown — never other riders' names.

import { createAdminDb } from "@/lib/checkout";
import { phoneHref } from "@/lib/settings";
import { raiseStaffAlert } from "@/lib/notifications/alerts";
import {
  MESSAGE_MAX, TERMINALS, deriveRun, estimatePosition, etaForStop, runSchedule, terminalShort, to12h, windowLabel,
  type Position, type RiderUpdate, type RunKind, type Stage,
} from "@/lib/driver-run";
import { UUID_RE, loadOpsSettings, loadRiders, loadRuns, tripOf, type RunPayload } from "@/lib/driver-runs-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export interface TrackPayload {
  firstName: string;
  confirmation: string;
  businessPhone: string;
  businessPhoneHref: string;
  leg: { kind: RunKind; date: string; time: string; label: string; when: string };
  active: boolean;            // today-ish: worth polling
  driver: { firstName: string; photoUrl: string | null } | null;
  vehicle: { name: string; plate: string } | null;
  stage: Stage;
  position: Position;
  myStop: {
    terminal: string; short: string; spot: string; spotPhoto: string | null;
    state: "upcoming" | "current" | "done"; number: number; total: number; eta: string | null;
  } | null;
  stopOrder: string[];
  wait: { minutes: number; max: number };
  me: { boarded: boolean; noShow: boolean; update: RiderUpdate | null };
  terminals: string[];
  /** This rider's chat with the driver, oldest first. */
  messages: { id: string; from: "me" | "driver" | "office"; body: string; at: string }[];
  canMessage: boolean;
}

async function reservationByToken(sb: Db, token: string) {
  if (!UUID_RE.test(token)) return null;
  const { data } = await sb.from("reservations")
    .select("id, status, deleted_at, confirmation_number, trip_id, return_trip_id, customer:customers(first_name)")
    .eq("track_token", token).maybeSingle();
  return data && data.status !== "cancelled" && !data.deleted_at ? data : null;
}

interface Leg { tripId: string; run: RunPayload | null; tripRow: any }

/** Which of the booking's rides to show: the one under way, else the next, else the last. */
async function pickLeg(sb: Db, r: any): Promise<Leg | null> {
  const tripIds = [r.trip_id, r.return_trip_id].filter(Boolean) as string[];
  const [{ data: trips }, { data: tvs }] = await Promise.all([
    sb.from("trips").select("id, departure_date, departure_time, status, is_private, route:routes(name, origin_key, duration_minutes)").in("id", tripIds),
    sb.from("trip_vehicles").select("id, trip_id").in("trip_id", tripIds),
  ]);
  const runs = tvs?.length ? await loadRuns(sb, { tripVehicleIds: tvs.map((t: any) => t.id) }) : [];
  const now = Date.now();
  const legs: (Leg & { start: number; end: number; started: boolean; done: boolean })[] = [];
  for (const id of tripIds) {
    const t = (trips ?? []).find((x: any) => x.id === id);
    if (!t || t.status === "cancelled") continue;
    // Several vans on one departure: follow the one furthest along.
    const mine = runs.filter((x) => x.trip.id === id)
      .sort((a, b) => b.events.length - a.events.length)[0] ?? null;
    const trip = tripOf({ trip: t });
    const sch = runSchedule(trip);
    legs.push({
      tripId: id, run: mine, tripRow: t,
      start: new Date(sch.leaveVolt).getTime(), end: new Date(sch.backAtVolt).getTime(),
      started: !!mine?.events.some((e) => e.kind === "left_volt"),
      done: !!mine?.events.some((e) => e.kind === "run_completed") || t.status === "completed",
    });
  }
  if (!legs.length) return null;
  legs.sort((a, b) => a.start - b.start);
  return legs.find((l) => l.started && !l.done)
    ?? legs.find((l) => !l.done && l.end > now - 3600_000)
    ?? legs[legs.length - 1];
}

export async function loadTrack(token: string): Promise<TrackPayload | null> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r) return null;
  const leg = await pickLeg(sb, r);
  if (!leg) return null;
  const settings = await loadOpsSettings(sb);

  const trip = tripOf({ trip: leg.tripRow });
  const riders = leg.run?.riders ?? (await loadRiders(sb, [leg.tripId])).get(leg.tripId) ?? [];
  const events = leg.run?.events ?? [];
  const now = Date.now();
  const d = deriveRun(trip, riders, events, now, settings);
  const me = riders.find((x) => x.reservationId === r.id);
  const sch = runSchedule(trip);

  let myStop: TrackPayload["myStop"] = null;
  if (me) {
    const idx = d.stops.findIndex((s) => s.terminal === me.terminal);
    const stop = d.stops[idx];
    const eta = etaForStop(d, me.terminal, trip.routeMinutes, now);
    myStop = {
      terminal: me.terminal,
      short: terminalShort(me.terminal),
      spot: d.spotNotes[me.terminal] ?? settings.spots[me.terminal]?.text ?? "",
      spotPhoto: settings.spots[me.terminal]?.photo ?? null,
      state: stop?.state ?? "upcoming",
      number: idx + 1,
      total: d.stops.length,
      eta: eta ? windowLabel(eta.from, eta.to) : null,
    };
  }

  const from = trip.kind === "from_atl" ? "ATL" : "Columbus";
  const to = trip.kind === "from_atl" ? "Columbus" : "ATL";
  const dateLabel = new Date(`${trip.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return {
    firstName: r.customer?.first_name ?? "",
    confirmation: r.confirmation_number,
    businessPhone: settings.businessPhone,
    businessPhoneHref: phoneHref(settings.businessPhone),
    leg: {
      kind: trip.kind, date: trip.date, time: trip.time,
      label: `${from} → ${to}`,
      when: `${dateLabel} · ${trip.kind === "from_atl" ? "pickup" : "departs"} ${to12h(trip.time)}`,
    },
    active: now > new Date(sch.leaveVolt).getTime() - 4 * 3600_000 && now < new Date(sch.backAtVolt).getTime() + 3600_000,
    driver: leg.run?.driver ? { firstName: leg.run.driver.firstName, photoUrl: leg.run.driver.photoUrl } : null,
    vehicle: leg.run?.vehicle ? { name: leg.run.vehicle.name, plate: leg.run.vehicle.plate } : null,
    stage: d.stage,
    position: estimatePosition(d, trip.routeMinutes, now),
    myStop,
    stopOrder: d.stops.map((s) => terminalShort(s.terminal)),
    wait: { minutes: settings.waitMinutes, max: settings.waitMaxMinutes },
    me: { boarded: !!me?.boarded, noShow: !!me?.noShow, update: me?.update ?? null },
    terminals: [...TERMINALS],
    messages: (me?.messages ?? []).map((m) => ({ id: m.id, from: m.from === "rider" ? "me" as const : m.from, body: m.body, at: m.at })),
    canMessage: !!me && !me.boarded && !me.noShow && d.stage !== "completed",
  };
}

export interface TrackUpdateInput {
  status?: string | null;        // outside | baggage | delayed | cant_make_it | clear
  delayMinutes?: number | null;
  newLandingTime?: string | null;
  terminal?: string | null;
}

export async function saveTrackUpdate(token: string, input: TrackUpdateInput): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r) return { ok: false, error: "This tracking link isn't valid.", status: 404 };
  const leg = await pickLeg(sb, r);
  if (!leg) return { ok: false, error: "No ride found for this booking.", status: 404 };
  if (leg.run?.events.some((e) => e.kind === "run_completed")) return { ok: false, error: "This ride is already finished.", status: 409 };

  const row: Record<string, unknown> = { trip_id: leg.tripId, reservation_id: r.id, updated_at: new Date().toISOString() };
  const status = input.status ?? undefined;
  if (status !== undefined) {
    if (status === "clear") Object.assign(row, { status: null, delay_minutes: null, new_landing_time: null });
    else if (status === "outside") Object.assign(row, { status, delay_minutes: null });
    else if (status === "baggage") {
      const m = Number(input.delayMinutes);
      if (![10, 20, 30].includes(m)) return { ok: false, error: "Pick how long you need.", status: 400 };
      Object.assign(row, { status, delay_minutes: m });
    } else if (status === "delayed") {
      const t = String(input.newLandingTime ?? "");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { ok: false, error: "Enter your new landing time.", status: 400 };
      Object.assign(row, { status, new_landing_time: t });
    } else if (status === "cant_make_it") Object.assign(row, { status });
    else return { ok: false, error: "Unknown update.", status: 400 };
  }
  if (input.terminal !== undefined && input.terminal !== null) {
    if (!(TERMINALS as readonly string[]).includes(input.terminal)) return { ok: false, error: "Pick a terminal.", status: 400 };
    row.terminal = input.terminal;
  }

  const { error } = await sb.from("trip_rider_updates").upsert(row, { onConflict: "trip_id,reservation_id" });
  if (error) {
    console.error("[track] save update", error);
    return { ok: false, error: "Couldn't send that. Try again or call Volt.", status: 500 };
  }

  // Tell the office about the ones that change plans.
  const name = r.customer?.first_name ?? "A rider";
  const what = status === "cant_make_it" ? "says they can't make this ride"
    : status === "delayed" ? `says their flight is delayed, now landing ${to12h(String(row.new_landing_time))}`
    : row.terminal ? `says they're at ${terminalShort(String(row.terminal))}` : null;
  if (what) {
    await raiseStaffAlert(sb, "driver_run", {
      key: `rider:${leg.tripId}:${r.id}:${status ?? "terminal"}:${row.new_landing_time ?? row.terminal ?? ""}`,
      subject: `${name} (${r.confirmation_number}) ${what}`,
      text: `${name}, booking ${r.confirmation_number}, ${what} (from their tracking page). The driver sees this on My Trips.`,
      link: "/dashboard/dispatch",
    });
  }
  return { ok: true };
}

/** Rider → driver note from the tracking page. Shows under the rider on My Trips and the live board. */
export async function saveTrackMessage(token: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const text = typeof body === "string" ? body.replace(/\s+/g, " ").trim() : "";
  if (!text) return { ok: false, error: "Type a message first.", status: 400 };
  if (text.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.`, status: 400 };
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r) return { ok: false, error: "This tracking link isn't valid.", status: 404 };
  const leg = await pickLeg(sb, r);
  if (!leg) return { ok: false, error: "No ride found for this booking.", status: 404 };
  if (leg.run?.events.some((e) => e.kind === "run_completed")) return { ok: false, error: "This ride is already finished.", status: 409 };
  // A rider who keeps typing is fine; a script isn't. Cap each booking per ride.
  const { count } = await sb.from("trip_messages").select("id", { count: "exact", head: true })
    .eq("trip_id", leg.tripId).eq("reservation_id", r.id).eq("sender", "rider");
  if ((count ?? 0) >= 30) return { ok: false, error: "That's a lot of messages. Please call Volt instead.", status: 429 };
  const { error } = await sb.from("trip_messages").insert({ trip_id: leg.tripId, reservation_id: r.id, sender: "rider", body: text });
  if (error) {
    console.error("[track] save message", error);
    return { ok: false, error: "Couldn't send that. Try again or call Volt.", status: 500 };
  }
  return { ok: true };
}
