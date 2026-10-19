// ─── Trip timeline ────────────────────────────────────────────────────────────
// Turns one scheduled trip into the clock times staff actually work to:
//   Columbus → ATL: rider at Volt by · van leaves Volt · drop-off at ATL
//   ATL → Columbus: van leaves Volt · pickup at ATL · back at Volt
// A trip's departure_time is when the van leaves its ORIGIN, so for an ATL
// pickup the van has to leave Volt one route-time earlier. Times can cross
// midnight, so every point carries its own date. Pure — no I/O, safe anywhere.

export interface ClockPoint {
  date: string;  // "2026-12-19"
  time: string;  // "04:00"
}

/** Moves a wall-clock date/time by `minutes` (can be negative), crossing days as needed. */
export function shiftClock(date: string, time: string, minutes: number): ClockPoint {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return {
    date: t.toISOString().slice(0, 10),
    time: `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/** Minutes from `a` to `b` (negative if b is earlier). */
export function minutesBetween(a: ClockPoint, b: ClockPoint): number {
  const ms = (p: ClockPoint) => {
    const [y, m, d] = p.date.split("-").map(Number);
    const [hh, mm] = p.time.split(":").map(Number);
    return Date.UTC(y, m - 1, d, hh, mm);
  };
  return Math.round((ms(b) - ms(a)) / 60_000);
}

/** 140 → "2h 20m", 60 → "1h", 45 → "45m". */
export function formatDuration(minutes: number): string {
  const m = Math.abs(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export type LegKind = "to_atl" | "from_atl";

export interface LegTimes {
  kind: LegKind;
  /** When the van pulls out of Volt (for a pickup: the latest it can leave and still be on time). */
  leaveVolt: ClockPoint;
  /** to_atl: drop-off at the airport. from_atl: pickup at the airport. */
  atAtl: ClockPoint;
  /** to_atl only: riders should be at Volt by this time. */
  ridersAtVoltBy?: ClockPoint;
  /** from_atl only: when the van gets back to Volt. */
  backAtVolt?: ClockPoint;
}

/**
 * The working times for one trip. `originKey` is the route's origin_key
 * ("columbus" or "atl"); `routeMinutes` is routes.duration_minutes.
 */
export function legTimes(
  originKey: string,
  date: string,
  departureTime: string,
  routeMinutes: number,
  arriveEarlyMinutes = 0,
): LegTimes {
  const dep: ClockPoint = { date, time: departureTime.slice(0, 5) };
  if (originKey === "atl") {
    return {
      kind: "from_atl",
      leaveVolt: shiftClock(dep.date, dep.time, -routeMinutes),
      atAtl: dep,
      backAtVolt: shiftClock(dep.date, dep.time, routeMinutes),
    };
  }
  return {
    kind: "to_atl",
    leaveVolt: dep,
    atAtl: shiftClock(dep.date, dep.time, routeMinutes),
    ridersAtVoltBy: arriveEarlyMinutes > 0 ? shiftClock(dep.date, dep.time, -arriveEarlyMinutes) : undefined,
  };
}

/**
 * Where at Hartsfield-Jackson, from the terminal the rider gave us
 * ("Domestic – South" → "Domestic Terminal – South"). Null when we weren't told.
 */
export function atlSpot(terminal: string | null | undefined): string | null {
  if (!terminal) return null;
  if (terminal.startsWith("International")) return "International Terminal (Concourse F)";
  if (terminal.startsWith("Domestic")) return terminal.replace("Domestic", "Domestic Terminal");
  return terminal;
}
