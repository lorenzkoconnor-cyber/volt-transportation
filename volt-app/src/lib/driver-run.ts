// ─── Driver runs (client-safe, pure) ──────────────────────────────────────────
// One "run" = one van + driver on one departure (a trip_vehicles row). The
// driver's taps are stored as events (trip_run_events, migration 040); every
// screen works out the rest from them with deriveRun():
//   • My Trips (driver)       — what's next, which stop, who to board
//   • /track/<token> (rider)  — where the van probably is and when it gets to them
//   • Dispatch (office)       — live board + problems to look at
//   • Practice mode           — the same rules on a pretend trip, nothing sent
//
// Between taps nothing is known for sure, so positions are ESTIMATES from the
// clock: minutes since the van left ÷ the route's drive time, capped at 90%
// so the page never claims "arrived" on its own.
// ──────────────────────────────────────────────────────────────────────────────

export const TERMINALS = ["Domestic – South", "Domestic – North", "International (Concourse F)"] as const;
export const UNKNOWN_TERMINAL = "Terminal not given";

/** Short names for buttons: "Domestic South", "International". */
export function terminalShort(t: string): string {
  if (t.startsWith("International")) return "International";
  if (t === UNKNOWN_TERMINAL) return "Terminal not given";
  return t.replace(" – ", " ");
}

export type RunKind = "from_atl" | "to_atl";

export type EventKind =
  | "left_volt" | "arrived_stop" | "stop_done" | "heading_home" | "run_completed" | "stop_reopened"
  | "boarded" | "unboarded" | "no_show" | "spot_note";

export interface RunEvent {
  id?: string;
  kind: EventKind;
  terminal?: string | null;
  reservationId?: string | null;
  note?: string | null;
  actor?: "driver" | "office";
  at: string; // ISO instant
}

export type RiderStatus = "outside" | "baggage" | "delayed" | "cant_make_it";

export interface RiderUpdate {
  status: RiderStatus | null;
  delayMinutes: number | null;
  newLandingTime: string | null; // "21:10"
  terminal: string | null;
  updatedAt: string;
}

export interface RunRider {
  reservationId: string;
  name: string;           // lead passenger
  partySize: number;
  terminal: string;       // where they are at ATL (rider's correction wins)
  bookedTerminal: string; // what they booked with
  flight: string | null;  // "DL 1234 · lands 9:15 PM"
  boarded: boolean;
  noShow: boolean;
  notes: string;
  doorAddress: string | null; // door-to-door pickup (Columbus → ATL) or drop-off (ATL → Columbus)
  rideAlong: boolean;
  update: RiderUpdate | null;
  canText: boolean;       // agreed to texts and has a phone
  messages: RunMessage[]; // tracking-page chat with this rider, oldest first
}

// ── Rider ↔ driver messages ──────────────────────────────────────────────────
export type MessageSender = "rider" | "driver" | "office";
export interface RunMessage { id: string; from: MessageSender; body: string; at: string }

export const MESSAGE_MAX = 160;

/** Driver one-tap replies (key → text). Shown on the rider's page; texted too if they agreed to texts. */
export const DRIVER_QUICK_REPLIES = {
  see_you: "I see you, coming now.",
  stay: "Stay where you are, I'll come to you.",
  here: "I'm at the pickup spot now. Look for the Volt van.",
  two_min: "I'll be at your pickup spot in about 2 minutes.",
  where: "I'm at the pickup spot. Where are you?",
} as const;
export type QuickReplyKey = keyof typeof DRIVER_QUICK_REPLIES;

/** Fill-in starters on the rider's message box. */
export const RIDER_STARTERS = ["I'm at door ", "I'm by baggage carousel ", "I'm wearing a ", "Running a few minutes behind"] as const;

/** Rider messages newer than the driver's last reply (what still needs an answer). */
export function unansweredMessages(r: Pick<RunRider, "messages">): RunMessage[] {
  const out: RunMessage[] = [];
  for (const m of r.messages ?? []) {
    if (m.from === "rider") out.push(m);
    else out.length = 0;
  }
  return out;
}

export interface RunTrip {
  kind: RunKind;
  departureAt: string;   // ISO — when the van leaves its ORIGIN (ATL for from_atl)
  routeMinutes: number;
}

export interface RunSettings {
  waitMinutes: number;     // can mark a no-show after this
  waitMaxMinutes: number;  // office is flagged after this
}

export const DEFAULT_RUN_SETTINGS: RunSettings = { waitMinutes: 20, waitMaxMinutes: 25 };

// ── Clock helpers ────────────────────────────────────────────────────────────
const MIN = 60_000;
const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();

/** "2026-11-13" + "18:30" in Eastern time → ISO instant. */
export function easternInstant(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Offset of America/New_York at that moment (handles daylight saving).
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(t));
    const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - t;
  };
  const first = guess - offsetAt(guess);
  return iso(guess - offsetAt(first));
}

/** ISO → "7:45 PM" Eastern. */
export function clockLabel(at: string | number): string {
  return new Date(at).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

/** "7:40–7:55 PM" (or "7:40 PM–12:05 AM" across noon/midnight). */
export function windowLabel(from: string, to: string): string {
  const a = clockLabel(from);
  const b = clockLabel(to);
  const [at, ap] = a.split(" ");
  const [, bp] = b.split(" ");
  return ap === bp ? `${at}–${b}` : `${a}–${b}`;
}

// ── Schedule ─────────────────────────────────────────────────────────────────
export interface RunSchedule {
  leaveVolt: string;   // when the van should pull out of Volt
  atAtl: string;       // pickup time (from_atl) / drop-off time (to_atl)
  backAtVolt: string;
}

export function runSchedule(trip: RunTrip): RunSchedule {
  const dep = ms(trip.departureAt);
  const r = trip.routeMinutes * MIN;
  return trip.kind === "from_atl"
    ? { leaveVolt: iso(dep - r), atAtl: iso(dep), backAtVolt: iso(dep + r) }
    : { leaveVolt: iso(dep), atAtl: iso(dep + r), backAtVolt: iso(dep + 2 * r) };
}

// Minutes between ATL stops (curb to curb, airport loop roads).
export function minutesBetweenStops(a: string, b: string): number {
  if (a === b) return 0;
  const intl = (t: string) => t.startsWith("International");
  if (a === UNKNOWN_TERMINAL || b === UNKNOWN_TERMINAL) return 10;
  return intl(a) !== intl(b) ? 15 : 8;
}

const DWELL_MINUTES = 10; // rough time spent at a pickup stop

// ── Stops ────────────────────────────────────────────────────────────────────
export interface Stop {
  terminal: string;
  riders: RunRider[];
  state: "upcoming" | "current" | "done";
  arrivedAt: string | null;
  doneAt: string | null;
}

function terminalRank(t: string): number {
  const i = (TERMINALS as readonly string[]).indexOf(t);
  return i === -1 ? 99 : i;
}

/** Terminals with riders, in driving order (South → North → International, unknown last). */
export function stopTerminals(riders: RunRider[]): string[] {
  return [...new Set(riders.map((r) => r.terminal))].sort((a, b) => terminalRank(a) - terminalRank(b));
}

export type Stage =
  | "not_started"   // hasn't left Volt
  | "driving"       // on the road to ATL, or between ATL stops
  | "at_stop"       // parked at a terminal (from_atl pickups)
  | "heading_home"  // all ATL stops done, driving back to Columbus
  | "completed";

export type NextAction =
  | { type: "leave_volt"; label: string }
  | { type: "arrive"; terminal: string; label: string }
  | { type: "stop_done"; terminal: string; label: string }
  | { type: "drop_off"; terminal: string; label: string }
  | { type: "back_at_volt"; label: string }
  | { type: "none"; label: string };

export interface DerivedRun {
  kind: RunKind;
  schedule: RunSchedule;
  stage: Stage;
  stops: Stop[];
  currentStop: Stop | null;
  nextStop: Stop | null;        // next stop not done (and not current)
  leftVoltAt: string | null;
  completedAt: string | null;
  lastDoneAt: string | null;    // most recent stop finished
  next: NextAction;
  waitedMinutes: number | null; // at the current stop
  noShowAllowed: boolean;
  overWait: boolean;
  spotNotes: Record<string, string>; // terminal → driver's "different spot" note
}

export function deriveRun(trip: RunTrip, riders: RunRider[], events: RunEvent[], now: number, settings: RunSettings = DEFAULT_RUN_SETTINGS): DerivedRun {
  const schedule = runSchedule(trip);
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));

  let leftVoltAt: string | null = null;
  let completedAt: string | null = null;
  let headingHomeAt: string | null = null;
  const arrived = new Map<string, string>();
  const done = new Map<string, string>();
  const spotNotes: Record<string, string> = {};

  for (const e of sorted) {
    const t = e.terminal ?? "";
    switch (e.kind) {
      case "left_volt": leftVoltAt ??= e.at; break;
      case "arrived_stop": if (t) { arrived.set(t, e.at); done.delete(t); } break;
      case "stop_done":
        if (t) { done.set(t, e.at); if (!arrived.has(t)) arrived.set(t, e.at); }
        break;
      case "stop_reopened": if (t) { arrived.delete(t); done.delete(t); } break;
      case "heading_home": headingHomeAt = e.at; break;
      case "run_completed": completedAt = e.at; break;
      case "spot_note": if (t && e.note) spotNotes[t] = e.note; break;
    }
  }

  const terminals = stopTerminals(riders);
  const stops: Stop[] = terminals.map((terminal) => ({
    terminal,
    riders: riders.filter((r) => r.terminal === terminal),
    state: done.has(terminal) ? "done" : arrived.has(terminal) ? "current" : "upcoming",
    arrivedAt: arrived.get(terminal) ?? null,
    doneAt: done.get(terminal) ?? null,
  }));
  // Only one stop can be "current" — the latest arrival wins.
  const currents = stops.filter((s) => s.state === "current").sort((a, b) => ms(b.arrivedAt!) - ms(a.arrivedAt!));
  currents.slice(1).forEach((s) => { s.state = "upcoming"; s.arrivedAt = null; });
  const currentStop = currents[0] ?? null;
  const remaining = stops.filter((s) => s.state === "upcoming");
  const nextStop = remaining[0] ?? null;
  const doneTimes = stops.map((s) => s.doneAt).filter(Boolean) as string[];
  const lastDoneAt = doneTimes.length ? doneTimes.sort((a, b) => ms(b) - ms(a))[0] : null;

  let stage: Stage;
  if (completedAt) stage = "completed";
  else if (!leftVoltAt) stage = "not_started";
  else if (trip.kind === "from_atl" && currentStop) stage = "at_stop";
  else if (headingHomeAt || !nextStop) stage = "heading_home";
  else stage = "driving";

  let next: NextAction;
  if (stage === "completed") next = { type: "none", label: "Trip complete" };
  else if (stage === "not_started") {
    next = { type: "leave_volt", label: trip.kind === "from_atl" ? "On the way to ATL" : "Leaving Volt" };
  } else if (stage === "at_stop" && currentStop) {
    next = nextStop
      ? { type: "stop_done", terminal: currentStop.terminal, label: `Done, go to ${terminalShort(nextStop.terminal)}` }
      : { type: "stop_done", terminal: currentStop.terminal, label: "Done, head to Columbus" };
  } else if (stage === "driving" && nextStop) {
    next = trip.kind === "from_atl"
      ? { type: "arrive", terminal: nextStop.terminal, label: `Arrived at ${terminalShort(nextStop.terminal)}` }
      : { type: "drop_off", terminal: nextStop.terminal, label: `Dropped off at ${terminalShort(nextStop.terminal)}` };
  } else next = { type: "back_at_volt", label: "Back at Volt" };

  // Waiting at the curb.
  let waitedMinutes: number | null = null;
  let noShowAllowed = false;
  let overWait = false;
  if (stage === "at_stop" && currentStop?.arrivedAt) {
    waitedMinutes = Math.max(0, Math.floor((now - ms(currentStop.arrivedAt)) / MIN));
    noShowAllowed = waitedMinutes >= settings.waitMinutes;
    overWait = waitedMinutes >= settings.waitMaxMinutes;
  } else if (trip.kind === "to_atl" && stage === "not_started") {
    // Boarding at Volt: no-show once departure time has passed.
    noShowAllowed = now >= ms(trip.departureAt);
  }

  return {
    kind: trip.kind, schedule, stage, stops, currentStop, nextStop, leftVoltAt, completedAt, lastDoneAt,
    next, waitedMinutes, noShowAllowed, overWait, spotNotes,
  };
}

// ── Where is the van? (estimate) ─────────────────────────────────────────────
// The marker moves steadily from the moment the van leaves: straight-line with
// the clock up to 90% of the drive, then it keeps creeping forward ever more
// slowly (never reaching 100%) until the driver taps "Arrived". No landmark
// steps — the bar is one smooth line from start to destination.

/** Share of the drive done (0–1, never quite 1) after `elapsedMs` of a `totalMs` drive. */
export function driveFraction(elapsedMs: number, totalMs: number): number {
  const raw = Math.max(0, elapsedMs / totalMs);
  if (raw <= 0.9) return raw;
  return 0.9 + 0.09 * (1 - Math.exp(-(raw - 0.9) / 0.1));
}

function minutesLeftLabel(elapsedMs: number, totalMs: number, place: string): string {
  const left = Math.round((totalMs - elapsedMs) / MIN);
  if (left <= 2) return `Arriving at ${place} any minute`;
  return `About ${left} min to ${place}`;
}

/** The position at `now` for a moving van (same math the server used, re-run each second). */
export function livePosition(p: Position, now: number): { fromColumbus: number; label: string } {
  if (!p.motion) return { fromColumbus: p.fromColumbus, label: p.label };
  const f = driveFraction(now - p.motion.startAt, p.motion.totalMs);
  return {
    fromColumbus: p.motion.towardAtl ? f : 1 - f,
    label: minutesLeftLabel(now - p.motion.startAt, p.motion.totalMs, p.motion.place),
  };
}

export interface Position {
  /** 0 = Columbus, 1 = ATL. */
  fromColumbus: number;
  towardAtl: boolean;
  label: string;          // "Near LaGrange", "At Domestic South", …
  headline: string;       // "On the way to ATL"
  estimated: boolean;     // false when the label comes straight from a tap
  /** Set while the van is on the highway: lets a page keep the marker moving every second. */
  motion?: { startAt: number; totalMs: number; towardAtl: boolean; place: string };
  eta: { label: string; from: string; to: string } | null; // next place the van is headed
}

export function estimatePosition(d: DerivedRun, routeMinutes: number, now: number): Position {
  const r = routeMinutes * MIN;
  const win = (target: number, label: string) => ({ label, from: iso(target - 5 * MIN), to: iso(target + 15 * MIN) });

  switch (d.stage) {
    case "not_started":
      return {
        fromColumbus: 0, towardAtl: true, estimated: false,
        label: "At Volt", headline: d.kind === "from_atl" ? "Van hasn't left for ATL yet" : "Boarding at Volt",
        eta: d.kind === "from_atl" ? win(ms(d.schedule.atAtl), "ATL") : null,
      };
    case "completed":
      return { fromColumbus: 0, towardAtl: false, estimated: false, label: "Back at Volt", headline: "Trip complete", eta: null };
    case "at_stop":
      return {
        fromColumbus: 1, towardAtl: true, estimated: false,
        label: `At ${terminalShort(d.currentStop!.terminal)}`, headline: "At the airport",
        eta: null,
      };
    case "heading_home": {
      const start = d.lastDoneAt ? ms(d.lastDoneAt) : d.leftVoltAt ? ms(d.leftVoltAt) + r : now;
      const f = driveFraction(now - start, r);
      return {
        fromColumbus: 1 - f, towardAtl: false, estimated: true,
        label: minutesLeftLabel(now - start, r, "Volt"), headline: "On the way to Columbus",
        motion: { startAt: start, totalMs: r, towardAtl: false, place: "Volt" },
        eta: win(start + r, "Volt"),
      };
    }
    case "driving": {
      // Already working ATL stops → heading to the next terminal.
      if (d.lastDoneAt && d.nextStop) {
        const prev = d.stops.filter((s) => s.doneAt).sort((a, b) => ms(b.doneAt!) - ms(a.doneAt!))[0];
        const target = ms(d.lastDoneAt) + minutesBetweenStops(prev.terminal, d.nextStop.terminal) * MIN;
        return {
          fromColumbus: 1, towardAtl: true, estimated: true,
          label: `Heading to ${terminalShort(d.nextStop.terminal)}`, headline: "At the airport",
          eta: { label: terminalShort(d.nextStop.terminal), from: iso(Math.max(now, target - 2 * MIN)), to: iso(Math.max(now, target) + 8 * MIN) },
        };
      }
      const left = ms(d.leftVoltAt!);
      const f = driveFraction(now - left, r);
      return {
        fromColumbus: f, towardAtl: true, estimated: true,
        label: minutesLeftLabel(now - left, r, "ATL"), headline: "On the way to ATL",
        motion: { startAt: left, totalMs: r, towardAtl: true, place: "ATL" },
        eta: win(left + r, "ATL"),
      };
    }
  }
}

/** When the van should reach a rider's stop (from_atl), or null once it's there / done. */
export function etaForStop(d: DerivedRun, terminal: string, routeMinutes: number, now: number): { from: string; to: string } | null {
  if (d.kind !== "from_atl") return null;
  const idx = d.stops.findIndex((s) => s.terminal === terminal);
  if (idx === -1) return null;
  const stop = d.stops[idx];
  if (stop.state !== "upcoming") return null;

  // Where does the van start counting from?
  let t: number;
  let at: string | null = null; // terminal the van is at / just left
  if (d.stage === "not_started") t = ms(d.schedule.atAtl);
  else if (d.stage === "at_stop" && d.currentStop) {
    t = Math.max(now, ms(d.currentStop.arrivedAt!) + DWELL_MINUTES * MIN);
    at = d.currentStop.terminal;
  } else if (d.lastDoneAt) {
    const prev = d.stops.filter((s) => s.doneAt).sort((a, b) => ms(b.doneAt!) - ms(a.doneAt!))[0];
    t = ms(d.lastDoneAt);
    at = prev.terminal;
  } else t = Math.max(now, ms(d.leftVoltAt!) + routeMinutes * MIN);

  // Add the stops still to work before this one.
  for (const s of d.stops) {
    if (s.state !== "upcoming") continue;
    if (s.terminal === terminal) break;
    if (at) t += minutesBetweenStops(at, s.terminal) * MIN;
    t += DWELL_MINUTES * MIN;
    at = s.terminal;
  }
  if (at) t += minutesBetweenStops(at, terminal) * MIN;
  t = Math.max(t, now);
  return { from: iso(t - 3 * MIN), to: iso(t + 12 * MIN) };
}

// ── Problems the office should see ───────────────────────────────────────────
export interface RunIssue {
  key: string;            // stable id, for alert dedupe
  level: "alert" | "heads_up";
  text: string;
}

export function runIssues(d: DerivedRun, riders: RunRider[], routeMinutes: number, now: number): RunIssue[] {
  const out: RunIssue[] = [];
  if (d.stage === "not_started" && now > ms(d.schedule.leaveVolt) + 10 * MIN && riders.some((r) => !r.noShow)) {
    out.push({ key: "late_start", level: "alert", text: `Hasn't left Volt (due ${clockLabel(d.schedule.leaveVolt)})` });
  }
  if (d.stage === "driving" && !d.lastDoneAt && d.leftVoltAt && now > ms(d.leftVoltAt) + (routeMinutes + 15) * MIN) {
    out.push({ key: "overdue_atl", level: "alert", text: "Should be at ATL by now, no arrival logged" });
  }
  if (d.stage === "heading_home" && d.lastDoneAt && now > ms(d.lastDoneAt) + (routeMinutes + 30) * MIN) {
    out.push({ key: "overdue_home", level: "heads_up", text: "Should be back at Volt by now" });
  }
  if (d.overWait && d.currentStop) {
    out.push({ key: `long_wait:${d.currentStop.terminal}`, level: "alert", text: `Waiting ${d.waitedMinutes} min at ${terminalShort(d.currentStop.terminal)}` });
  }
  for (const r of riders) {
    if (r.boarded || r.noShow || !r.update?.status) continue;
    const u = r.update;
    if (u.status === "cant_make_it") out.push({ key: `cant:${r.reservationId}`, level: "alert", text: `${r.name} says they can't make this ride` });
    else if (u.status === "delayed") out.push({ key: `delayed:${r.reservationId}`, level: "heads_up", text: `${r.name}: flight delayed${u.newLandingTime ? `, lands ${to12h(u.newLandingTime)}` : ""}` });
    else if (u.status === "baggage") out.push({ key: `bags:${r.reservationId}`, level: "heads_up", text: `${r.name}: at baggage, ~${u.delayMinutes ?? 10} min` });
  }
  const noShows = riders.filter((r) => r.noShow);
  if (noShows.length) out.push({ key: "no_shows", level: "heads_up", text: `No-show: ${noShows.map((r) => r.name).join(", ")}` });
  return out;
}

export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ── Pre-trip checklist ───────────────────────────────────────────────────────
export const CHECK_ITEMS = [
  { key: "tires", label: "Tires look good" },
  { key: "lights", label: "Lights and signals work" },
  { key: "mirrors", label: "Mirrors and windows clean" },
  { key: "belts", label: "Seat belts work" },
  { key: "clean", label: "Inside is clean" },
  { key: "safety", label: "First-aid kit and fire extinguisher on board" },
] as const;

export const FUEL_LEVELS = ["full", "3/4", "1/2", "1/4", "low"] as const;

/** "9h 20m" */
export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
