// ─── Driver runs (server-only) ────────────────────────────────────────────────
// Loads runs (van + driver on a departure) with their riders and taps, saves
// the driver's taps, and sends riders the "on the way" / "arrived" texts.
// The rules for what a run looks like live in src/lib/driver-run.ts (pure).

import { easternToday } from "@/lib/format";
import { enqueue, type QueueItem } from "@/lib/notifications/queue";
import { emailHtml, isDeliverableEmail } from "@/lib/notifications/email";
import { raiseStaffAlert } from "@/lib/notifications/alerts";
import { appUrl } from "@/lib/reservation-messages";
import {
  DEFAULT_RUN_SETTINGS, TERMINALS, UNKNOWN_TERMINAL, deriveRun, easternInstant, etaForStop, runSchedule,
  terminalShort, to12h, windowLabel, clockLabel, MESSAGE_MAX,
  type EventKind, type RunEvent, type RunKind, type RunRider, type RunSettings, type RunTrip,
} from "@/lib/driver-run";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Settings ─────────────────────────────────────────────────────────────────
export interface OpsSettings extends RunSettings {
  maxShiftHours: number;
  spots: Record<string, { text: string; photo: string | null }>;
  businessPhone: string;
}

const SPOT_COLUMNS: Record<string, string> = {
  "Domestic – South": "atl_spot_domestic_south",
  "Domestic – North": "atl_spot_domestic_north",
  "International (Concourse F)": "atl_spot_international",
};
export const SPOT_COLUMN_BY_TERMINAL = SPOT_COLUMNS;

export async function loadOpsSettings(sb: Db): Promise<OpsSettings> {
  const { data: row } = await sb.from("booking_settings").select("*").maybeSingle();
  const spots: OpsSettings["spots"] = {};
  for (const t of TERMINALS) {
    const col = SPOT_COLUMNS[t];
    spots[t] = { text: row?.[col] ?? "Commercial shuttle pickup area (Ground Transportation).", photo: row?.[`${col}_photo`] ?? null };
  }
  spots[UNKNOWN_TERMINAL] = { text: "Your driver will text you the exact spot.", photo: null };
  return {
    waitMinutes: row?.atl_wait_minutes ?? DEFAULT_RUN_SETTINGS.waitMinutes,
    waitMaxMinutes: row?.atl_wait_max_minutes ?? DEFAULT_RUN_SETTINGS.waitMaxMinutes,
    maxShiftHours: row?.driver_max_shift_hours ?? 10,
    spots,
    businessPhone: row?.business_phone ?? "(706) 530-5896",
  };
}

// ── Who is this driver? ──────────────────────────────────────────────────────
/** The drivers row for a signed-in employee; links it by email the first time. */
export async function driverForEmployee(sb: Db, employeeId: string): Promise<any | null> {
  const cols = "id, first_name, last_name, phone, photo_url, employee_id";
  const { data: linked } = await sb.from("drivers").select(cols).eq("employee_id", employeeId).maybeSingle();
  if (linked) return linked;
  const { data: emp } = await sb.from("employees").select("email").eq("id", employeeId).maybeSingle();
  if (!emp?.email) return null;
  const { data: byEmail } = await sb.from("drivers").select(cols).ilike("email", emp.email).is("employee_id", null).limit(1);
  const d = byEmail?.[0];
  if (!d) return null;
  await sb.from("drivers").update({ employee_id: employeeId }).eq("id", d.id);
  return { ...d, employee_id: employeeId };
}

// ── Loading runs ─────────────────────────────────────────────────────────────
export interface RunPayload {
  tripVehicleId: string;
  trip: {
    id: string; date: string; time: string; kind: RunKind; routeName: string;
    routeMinutes: number; departureAt: string; status: string; isPrivate: boolean;
  };
  vehicle: { id: string; name: string; plate: string; capacity: number } | null;
  driver: { id: string; name: string; firstName: string; photoUrl: string | null } | null;
  riders: RunRider[];
  events: RunEvent[];
  checkedToday: boolean;   // this driver has done the pre-trip check on this van today
}

const TV_SELECT =
  "id, trip_id, vehicle_id, driver_id, " +
  "vehicle:vehicles(id, name, license_plate, capacity), " +
  "driver:drivers(id, first_name, last_name, photo_url), " +
  "trip:trips!inner(id, departure_date, departure_time, status, is_private, route:routes(name, origin_key, duration_minutes))";

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Start of today in Eastern time, as an ISO instant. */
export function easternDayStart(date = easternToday()): string {
  return easternInstant(date, "00:00");
}

export function tripOf(tv: any): RunTrip & { date: string; time: string } {
  const t = tv.trip;
  const date = t.departure_date;
  const time = String(t.departure_time).slice(0, 5);
  return {
    kind: t.route?.origin_key === "atl" ? "from_atl" : "to_atl",
    departureAt: easternInstant(date, time),
    routeMinutes: t.route?.duration_minutes ?? 120,
    date, time,
  };
}

/**
 * Runs for a day (Eastern). Late-night runs from the day before that are still
 * going are included too, so a 10 PM pickup doesn't vanish at midnight.
 */
export async function loadRuns(sb: Db, opts: { date?: string; driverId?: string; tripVehicleIds?: string[] }): Promise<RunPayload[]> {
  let q = sb.from("trip_vehicles").select(TV_SELECT);
  if (opts.tripVehicleIds) q = q.in("id", opts.tripVehicleIds);
  else {
    const date = opts.date ?? easternToday();
    q = q.in("trip.departure_date", [shiftDate(date, -1), date]);
  }
  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  const { data: tvs, error } = await q;
  if (error) throw error;
  const rows = (tvs ?? []).filter((tv: any) => tv.trip && tv.trip.status !== "cancelled");
  if (!rows.length) return [];

  const tripIds = [...new Set(rows.map((tv: any) => tv.trip_id))] as string[];
  const tvIds = rows.map((tv: any) => tv.id);
  const [riders, eventsRes, checksRes] = await Promise.all([
    loadRiders(sb, tripIds),
    sb.from("trip_run_events")
      .select("id, trip_vehicle_id, kind, terminal, reservation_id, note, actor, happened_at")
      .in("trip_vehicle_id", tvIds)
      .order("happened_at"),
    sb.from("vehicle_checks")
      .select("vehicle_id, driver_id, checked_at")
      .in("vehicle_id", [...new Set(rows.map((tv: any) => tv.vehicle_id))])
      .gte("checked_at", easternDayStart()),
  ]);

  const now = Date.now();
  const today = opts.date ?? easternToday();
  const out: RunPayload[] = [];
  for (const tv of rows) {
    const trip = tripOf(tv);
    const events: RunEvent[] = (eventsRes.data ?? [])
      .filter((e: any) => e.trip_vehicle_id === tv.id)
      .map((e: any) => ({ id: e.id, kind: e.kind, terminal: e.terminal, reservationId: e.reservation_id, note: e.note, actor: e.actor, at: e.happened_at }));
    // Yesterday's runs only while they're still going (or ended in the last hour).
    if (!opts.tripVehicleIds && trip.date < today) {
      const done = events.find((e) => e.kind === "run_completed");
      const back = new Date(runSchedule(trip).backAtVolt).getTime();
      if (done ? new Date(done.at).getTime() < now - 3600_000 : back < now - 3 * 3600_000) continue;
    }
    out.push({
      tripVehicleId: tv.id,
      trip: {
        id: tv.trip_id, date: trip.date, time: trip.time, kind: trip.kind,
        routeName: tv.trip.route?.name ?? "", routeMinutes: trip.routeMinutes, departureAt: trip.departureAt,
        status: tv.trip.status, isPrivate: !!tv.trip.is_private,
      },
      vehicle: tv.vehicle ? { id: tv.vehicle.id, name: tv.vehicle.name, plate: tv.vehicle.license_plate, capacity: tv.vehicle.capacity } : null,
      driver: tv.driver ? {
        id: tv.driver.id, name: `${tv.driver.first_name} ${tv.driver.last_name}`.trim(),
        firstName: tv.driver.first_name, photoUrl: tv.driver.photo_url ?? null,
      } : null,
      riders: riders.get(tv.trip_id) ?? [],
      events,
      checkedToday: (checksRes.data ?? []).some((c: any) => c.vehicle_id === tv.vehicle_id && c.driver_id === tv.driver_id),
    });
  }
  return out.sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));
}

/** Riders per trip id, one entry per booking (party). */
export async function loadRiders(sb: Db, tripIds: string[]): Promise<Map<string, RunRider[]>> {
  const out = new Map<string, RunRider[]>();
  if (!tripIds.length) return out;
  const list = tripIds.filter((id) => UUID_RE.test(id)).join(",");
  const [paxRes, flightRes, updRes, msgRes] = await Promise.all([
    sb.from("reservation_passengers")
      .select(
        "id, name, is_primary, is_boarded, is_no_show, return_is_boarded, return_is_no_show, " +
        "reservation:reservations!inner(id, trip_id, return_trip_id, is_round_trip, special_notes, status, deleted_at, " +
        "pickup_address, dropoff_address, is_ride_along, sms_consent, customer:customers(phone))"
      )
      .or(`trip_id.in.(${list}),return_trip_id.in.(${list})`, { referencedTable: "reservation" })
      .neq("reservation.status", "cancelled")
      .is("reservation.deleted_at", null),
    sb.from("reservation_flights").select("reservation_id, trip_id, direction, airline, flight_number, terminal, flight_time").in("trip_id", tripIds),
    sb.from("trip_rider_updates").select("*").in("trip_id", tripIds),
    sb.from("trip_messages").select("id, trip_id, reservation_id, sender, body, created_at").in("trip_id", tripIds).order("created_at"),
  ]);

  for (const tripId of tripIds) {
    const byRes = new Map<string, any[]>();
    for (const p of paxRes.data ?? []) {
      const r = p.reservation;
      if (r.trip_id !== tripId && r.return_trip_id !== tripId) continue;
      if (!byRes.has(r.id)) byRes.set(r.id, []);
      byRes.get(r.id)!.push(p);
    }
    const riders: RunRider[] = [];
    for (const [resId, pax] of byRes) {
      const r = pax[0].reservation;
      const isReturn = r.trip_id !== tripId;
      const lead = pax.find((p) => p.is_primary) ?? pax[0];
      const f = (flightRes.data ?? []).find((x: any) => x.reservation_id === resId && x.trip_id === tripId);
      const u = (updRes.data ?? []).find((x: any) => x.reservation_id === resId && x.trip_id === tripId);
      const boardedOf = (p: any) => (isReturn ? p.return_is_boarded : p.is_boarded);
      const noShowOf = (p: any) => (isReturn ? p.return_is_no_show : p.is_no_show);
      const booked = f?.terminal || UNKNOWN_TERMINAL;
      riders.push({
        reservationId: resId,
        name: lead.name,
        partySize: pax.length,
        terminal: u?.terminal || booked,
        bookedTerminal: booked,
        flight: f ? `${f.airline} ${f.flight_number} · ${f.direction === "departing" ? "departs" : "lands"} ${to12h(String(f.flight_time).slice(0, 5))}` : null,
        boarded: pax.every((p) => boardedOf(p) || noShowOf(p)) && pax.some(boardedOf),
        noShow: pax.every(noShowOf),
        notes: r.special_notes ?? "",
        // Door service: pickup on the first leg, drop-off on the last.
        doorAddress: !isReturn && r.pickup_address ? `Pickup: ${r.pickup_address}`
          : (isReturn || !r.is_round_trip) && r.dropoff_address ? `Drop-off: ${r.dropoff_address}` : null,
        rideAlong: !!r.is_ride_along,
        update: u ? {
          status: u.status, delayMinutes: u.delay_minutes,
          newLandingTime: u.new_landing_time ? String(u.new_landing_time).slice(0, 5) : null,
          terminal: u.terminal, updatedAt: u.updated_at,
        } : null,
        canText: !!r.sms_consent && !!r.customer?.phone,
        messages: (msgRes.data ?? [])
          .filter((m: any) => m.reservation_id === resId && m.trip_id === tripId)
          .map((m: any) => ({ id: m.id, from: m.sender, body: m.body, at: m.created_at })),
      });
    }
    out.set(tripId, riders.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return out;
}

// ── Saving a tap ─────────────────────────────────────────────────────────────
const ACTIONS: EventKind[] = [
  "left_volt", "arrived_stop", "stop_done", "heading_home", "run_completed", "stop_reopened",
  "boarded", "unboarded", "no_show", "spot_note",
];
const NEEDS_TERMINAL: EventKind[] = ["arrived_stop", "stop_done", "stop_reopened", "spot_note"];
const NEEDS_RIDER: EventKind[] = ["boarded", "unboarded", "no_show"];

export interface ActionInput {
  kind: string;
  terminal?: string | null;
  reservationId?: string | null;
  note?: string | null;
  clientId?: string | null;
  at?: string | null;     // when the driver tapped (offline taps arrive later)
}

export interface ActionContext {
  actor: "driver" | "office";
  employeeId: string;
  employeeName: string;
}

export async function applyRunAction(sb: Db, run: RunPayload, ctx: ActionContext, input: ActionInput): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string; status?: number }> {
  const kind = input.kind as EventKind;
  if (!ACTIONS.includes(kind)) return { ok: false, error: "Unknown action.", status: 400 };
  const terminal = input.terminal ?? null;
  if (NEEDS_TERMINAL.includes(kind)) {
    if (!terminal || ![...TERMINALS, UNKNOWN_TERMINAL].includes(terminal as any)) return { ok: false, error: "Pick a terminal.", status: 400 };
  }
  const rider = input.reservationId ? run.riders.find((r) => r.reservationId === input.reservationId) : null;
  if (NEEDS_RIDER.includes(kind) && !rider) return { ok: false, error: "That rider isn't on this trip.", status: 400 };
  const note = input.note ? String(input.note).trim().slice(0, 200) : null;
  if (kind === "spot_note" && !note) return { ok: false, error: "Type where you are.", status: 400 };

  // Offline taps keep the time they happened (within the last 6 hours).
  let happenedAt = new Date().toISOString();
  if (input.at) {
    const t = new Date(input.at).getTime();
    if (Number.isFinite(t) && t <= Date.now() + 60_000 && t >= Date.now() - 6 * 3600_000) happenedAt = new Date(Math.min(t, Date.now())).toISOString();
  }
  const clientId = input.clientId ? String(input.clientId).slice(0, 64) : null;

  const { error } = await sb.from("trip_run_events").insert({
    trip_vehicle_id: run.tripVehicleId,
    trip_id: run.trip.id,
    driver_id: run.driver?.id ?? null,
    kind, terminal: NEEDS_TERMINAL.includes(kind) ? terminal : null,
    reservation_id: rider?.reservationId ?? null,
    note,
    actor: ctx.actor,
    actor_employee_id: ctx.employeeId,
    client_id: clientId,
    happened_at: happenedAt,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, duplicate: true }; // this tap was already saved
    console.error("[driver-runs] save tap", error);
    return { ok: false, error: "Couldn't save that. Try again.", status: 500 };
  }

  const event: RunEvent = { kind, terminal, reservationId: rider?.reservationId ?? null, note, actor: ctx.actor, at: happenedAt };
  const after = { ...run, events: [...run.events, event] };
  try {
    await sideEffects(sb, after, event, ctx);
  } catch (err) {
    console.error("[driver-runs] side effects", err);
  }
  return { ok: true };
}

async function sideEffects(sb: Db, run: RunPayload, e: RunEvent, ctx: ActionContext) {
  const isReturnFor = async (resId: string) => {
    const { data } = await sb.from("reservations").select("trip_id").eq("id", resId).maybeSingle();
    return data?.trip_id !== run.trip.id;
  };
  const setBoarding = async (resId: string, boarded: boolean, noShow: boolean) => {
    const ret = await isReturnFor(resId);
    await sb.from("reservation_passengers")
      .update(ret ? { return_is_boarded: boarded, return_is_no_show: noShow } : { is_boarded: boarded, is_no_show: noShow })
      .eq("reservation_id", resId);
  };

  switch (e.kind) {
    case "boarded": await setBoarding(e.reservationId!, true, false); break;
    case "unboarded": await setBoarding(e.reservationId!, false, false); break;
    case "no_show": {
      await setBoarding(e.reservationId!, false, true);
      const r = run.riders.find((x) => x.reservationId === e.reservationId);
      await raiseStaffAlert(sb, "driver_run", {
        key: `no_show:${run.trip.id}:${e.reservationId}`,
        subject: `No-show: ${r?.name ?? "rider"} (${run.trip.routeName}, ${to12h(run.trip.time)})`,
        text: `${run.driver?.name ?? ctx.employeeName} marked ${r?.name ?? "a rider"} (party of ${r?.partySize ?? 1}) as a no-show` +
          `${e.terminal ? ` at ${terminalShort(e.terminal)}` : ""}.\nThey may need rebooking or a follow-up.`,
        link: "/dashboard/dispatch",
      });
      break;
    }
    case "left_volt":
      if (run.trip.kind === "to_atl") {
        await sb.from("trips").update({ status: "in_progress" }).eq("id", run.trip.id).in("status", ["scheduled", "boarding"]);
      } else {
        await notifyRiders(sb, run, "on_the_way");
      }
      break;
    case "arrived_stop":
      if (run.trip.kind === "from_atl") await notifyRiders(sb, run, "arrived", e.terminal!);
      break;
    case "run_completed": {
      const { data: tvs } = await sb.from("trip_vehicles").select("id").eq("trip_id", run.trip.id);
      const { data: done } = await sb.from("trip_run_events").select("trip_vehicle_id").eq("trip_id", run.trip.id).eq("kind", "run_completed");
      const finished = new Set((done ?? []).map((d: any) => d.trip_vehicle_id));
      if ((tvs ?? []).every((t: any) => finished.has(t.id))) {
        await sb.from("trips").update({ status: "completed" }).eq("id", run.trip.id).neq("status", "cancelled");
      }
      break;
    }
  }
}

// ── Texts to riders ──────────────────────────────────────────────────────────
export function trackUrl(token: string): string {
  return `${appUrl()}/track/${token}`;
}

async function notifyRiders(sb: Db, run: RunPayload, what: "on_the_way" | "arrived", terminal?: string) {
  const settings = await loadOpsSettings(sb);
  const ids = run.riders.filter((r) => !r.boarded && !r.noShow).map((r) => r.reservationId);
  if (!ids.length) return;
  const { data: rows } = await sb.from("reservations")
    .select("id, track_token, sms_consent, customer:customers(first_name, phone, email)")
    .in("id", ids);
  const derived = deriveRun(run.trip, run.riders, run.events, Date.now(), settings);
  const driverFirst = run.driver?.firstName ?? "Your driver";
  const van = run.vehicle ? `${run.vehicle.name}${run.vehicle.plate ? ` (plate ${run.vehicle.plate})` : ""}` : "the Volt van";

  const items: QueueItem[] = [];
  for (const row of rows ?? []) {
    const rider = run.riders.find((r) => r.reservationId === row.id)!;
    const c = row.customer ?? {};
    const url = trackUrl(row.track_token);
    let sms: string;
    let subject: string;
    let key: string;
    if (what === "on_the_way") {
      key = `track_start:${run.trip.id}:${row.id}`;
      subject = "Your Volt driver is on the way to ATL";
      sms = `Volt Transportation: Hi ${c.first_name ?? "there"}, ${driverFirst} is on the way to ATL for your ${to12h(run.trip.time)} pickup. ` +
        `See where the van is and your pickup spot: ${url}`;
    } else if (rider.terminal === terminal) {
      key = `atl_arrived:${run.trip.id}:${terminal}:${row.id}`;
      const spot = derived.spotNotes[terminal!] ?? settings.spots[terminal!]?.text ?? "";
      subject = `Your Volt driver is at ${terminalShort(terminal!)}`;
      sms = `Volt Transportation: ${driverFirst} has arrived at ${terminalShort(terminal!)}. Pickup spot: ${spot} Look for ${van}. ` +
        `Running late or at another terminal? ${url}`;
    } else {
      const eta = etaForStop(derived, rider.terminal, run.trip.routeMinutes, Date.now());
      if (!eta) continue;
      key = `atl_eta:${run.trip.id}:${terminal}:${row.id}`;
      subject = "Your Volt driver is at the airport";
      sms = `Volt Transportation: Your driver is picking up at ${terminalShort(terminal!)} now and should reach ${terminalShort(rider.terminal)} ` +
        `about ${windowLabel(eta.from, eta.to)}. Live updates: ${url}`;
    }
    if (row.sms_consent && c.phone) {
      items.push({ channel: "sms", to: c.phone, text: sms, reservationId: row.id, kind: key.split(":")[0], audience: "customer", dedupeKey: key });
    } else if (isDeliverableEmail(c.email)) {
      const body = sms.replace(/^Volt Transportation: /, "");
      items.push({
        channel: "email", to: c.email, subject, text: body,
        html: emailHtml(subject, body, { label: "Track your van", url }),
        reservationId: row.id, kind: `${key.split(":")[0]}_email`, audience: "customer", dedupeKey: `${key}:email`,
      });
    }
  }
  if (items.length) await enqueue(sb, items);
}

/** A quick text from the driver to one rider, sent from Volt's number. */
/**
 * Driver (or office) → rider message. Always shows on the rider's tracking
 * page; also texted from Volt's number when the rider agreed to texts.
 */
export async function messageRider(
  sb: Db, run: RunPayload, reservationId: string, body: string,
  from: { sender: "driver" | "office"; employeeId: string },
): Promise<{ ok: true; texted: boolean; textError?: string } | { ok: false; error: string }> {
  const rider = run.riders.find((r) => r.reservationId === reservationId);
  if (!rider) return { ok: false, error: "That rider isn't on this trip." };
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.` };

  const { error } = await sb.from("trip_messages").insert({
    trip_id: run.trip.id, reservation_id: reservationId, sender: from.sender, body: text, employee_id: from.employeeId,
  });
  if (error) {
    console.error("[driver-runs] save message", error);
    return { ok: false, error: "Couldn't send that. Try again." };
  }

  const { data: row } = await sb.from("reservations")
    .select("id, track_token, sms_consent, customer:customers(phone)").eq("id", reservationId).maybeSingle();
  if (!row?.sms_consent || !row.customer?.phone) return { ok: true, texted: false };
  const who = from.sender === "office" ? "Volt office" : run.driver?.firstName ? `your driver ${run.driver.firstName}` : "your driver";
  const sms = `Volt Transportation (${who}): ${text}\nReply on your tracking page: ${trackUrl(row.track_token)}`;
  const [r] = await enqueue(sb, [{ channel: "sms", to: row.customer.phone, text: sms, reservationId, kind: "driver_text", audience: "customer" }]);
  return r.sent ? { ok: true, texted: true } : { ok: true, texted: false, textError: r.error ?? "The text didn't go out." };
}

// ── Shift length ─────────────────────────────────────────────────────────────
/** First thing this driver did today (a tap or a van check), or null. */
export async function shiftStartedAt(sb: Db, driverId: string): Promise<string | null> {
  const start = easternDayStart();
  const [{ data: ev }, { data: ch }] = await Promise.all([
    sb.from("trip_run_events").select("happened_at").eq("driver_id", driverId).eq("actor", "driver")
      .gte("happened_at", start).order("happened_at").limit(1),
    sb.from("vehicle_checks").select("checked_at").eq("driver_id", driverId).gte("checked_at", start).order("checked_at").limit(1),
  ]);
  const times = [ev?.[0]?.happened_at, ch?.[0]?.checked_at].filter(Boolean) as string[];
  return times.length ? times.sort()[0] : null;
}

export { clockLabel };

// ── Background check (cron, every 10 minutes) ────────────────────────────────
/** Alerts the office about vans that haven't left, are overdue at ATL, or are waiting too long. */
export async function scanRunAlerts(sb: Db): Promise<number> {
  const { runIssues } = await import("@/lib/driver-run");
  const settings = await loadOpsSettings(sb);
  const runs = await loadRuns(sb, {});
  const now = Date.now();
  let n = 0;
  for (const run of runs) {
    const d = deriveRun(run.trip, run.riders, run.events, now, settings);
    for (const issue of runIssues(d, run.riders, run.trip.routeMinutes, now)) {
      if (!(issue.key === "late_start" || issue.key === "overdue_atl" || issue.key.startsWith("long_wait"))) continue;
      await raiseStaffAlert(sb, "driver_run", {
        key: `${issue.key}:${run.tripVehicleId}`,
        subject: `${to12h(run.trip.time)} ${run.trip.kind === "from_atl" ? "ATL → Columbus" : "Columbus → ATL"}: ${issue.text}`,
        text: `${run.driver?.name ?? "No driver"} · ${run.vehicle?.name ?? "no van"}\n${issue.text}.\nCheck the live board on Dispatch.`,
        link: "/dashboard/dispatch",
      });
      n++;
    }
  }
  return n;
}
