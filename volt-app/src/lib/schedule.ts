// ─── Employee schedules + hours worked ────────────────────────────────────────
// Shifts are Eastern wall-clock times on a date (employee_shifts, migration 043).
// kind 'scheduled' = planned ahead, 'worked' = actual times an owner/manager
// entered. An end time at or before the start means the shift ran past
// midnight. Weeks (the pay period) run Monday–Sunday; a shift counts toward the
// week of its start date. Overtime = worked time over 40h in that week, paid
// at 1.5×. Pure — no I/O.

export type ShiftKind = "scheduled" | "worked";

export interface Shift {
  id: string;
  employee_id: string;
  kind: ShiftKind;
  shift_date: string;      // "YYYY-MM-DD"
  start_time: string;      // "HH:MM" or "HH:MM:SS"
  end_time: string;
  break_minutes: number;
  notes?: string | null;
}

export interface HoursSummary {
  scheduledMin: number;    // every scheduled shift in the week
  workedMin: number;       // every worked entry in the week
  remainingMin: number;    // scheduled time that hasn't happened yet
  projectedMin: number;    // worked + remaining
  regularMin: number;      // worked, up to 40h
  overtimeMin: number;     // worked, past 40h
  projectedOvertimeMin: number;
  payCents: number | null; // estimated pay for worked time (null = no rate set)
}

export const OVERTIME_THRESHOLD_MIN = 40 * 60;
export const OVERTIME_MULTIPLIER = 1.5;

const DAY_MS = 86_400_000;

function toUTC(date: string): Date {
  return new Date(date + "T00:00:00Z");
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(new Date(toUTC(date).getTime() + n * DAY_MS));
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = toUTC(date).getUTCDay(); // 0 = Sun
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** The 7 dates (Mon → Sun) of the week starting `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "08:30" | "08:30:00" → 510 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

/** True when the shift ends on the next day. */
export function isOvernight(s: Pick<Shift, "start_time" | "end_time">): boolean {
  return timeToMinutes(s.end_time) <= timeToMinutes(s.start_time);
}

/** Span from start to end in minutes (crossing midnight if needed). */
export function spanMinutes(s: Pick<Shift, "start_time" | "end_time">): number {
  const start = timeToMinutes(s.start_time);
  const end = timeToMinutes(s.end_time);
  return end > start ? end - start : end + 1440 - start;
}

/** Paid minutes: the span minus the unpaid break, never below zero. */
export function shiftMinutes(s: Pick<Shift, "start_time" | "end_time" | "break_minutes">): number {
  return Math.max(0, spanMinutes(s) - (s.break_minutes || 0));
}

/** The current Eastern date and minute of day. */
export function easternNow(now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10),
  };
}

/** Minutes of `date` 00:00 relative to `ref` 00:00 (whole days × 1440). */
function dayOffset(date: string, ref: string): number {
  return Math.round((toUTC(date).getTime() - toUTC(ref).getTime()) / DAY_MS) * 1440;
}

/**
 * Paid minutes of a scheduled shift still ahead of `now`: all of it before the
 * shift starts, none once it has ended, and while it's under way the time left
 * (capped at its paid minutes, so the break comes off the front).
 */
export function remainingMinutes(s: Shift, now: { date: string; minutes: number }): number {
  const start = dayOffset(s.shift_date, now.date) + timeToMinutes(s.start_time);
  const end = start + spanMinutes(s);
  const paid = shiftMinutes(s);
  if (now.minutes <= start) return paid;
  if (now.minutes >= end) return 0;
  return Math.min(paid, end - now.minutes);
}

/** Estimated pay in cents: regular at the rate, overtime at 1.5×. */
export function payCents(regularMin: number, overtimeMin: number, rateCents: number): number {
  return Math.round((regularMin * rateCents + overtimeMin * rateCents * OVERTIME_MULTIPLIER) / 60);
}

/** One employee's totals for the shifts given (already limited to one week). */
export function summarizeHours(
  shifts: Shift[],
  now: { date: string; minutes: number },
  rateCents: number | null | undefined,
): HoursSummary {
  let scheduledMin = 0, workedMin = 0, remainingMin = 0;
  for (const s of shifts) {
    if (s.kind === "worked") workedMin += shiftMinutes(s);
    else {
      scheduledMin += shiftMinutes(s);
      remainingMin += remainingMinutes(s, now);
    }
  }
  const regularMin = Math.min(workedMin, OVERTIME_THRESHOLD_MIN);
  const overtimeMin = Math.max(0, workedMin - OVERTIME_THRESHOLD_MIN);
  const projectedMin = workedMin + remainingMin;
  return {
    scheduledMin, workedMin, remainingMin, projectedMin, regularMin, overtimeMin,
    projectedOvertimeMin: Math.max(0, projectedMin - OVERTIME_THRESHOLD_MIN),
    payCents: rateCents == null ? null : payCents(regularMin, overtimeMin, rateCents),
  };
}

/** Totals per employee id for the week starting `monday`. */
export function summarizeWeek(
  shifts: Shift[],
  employeeIds: string[],
  monday: string,
  now: { date: string; minutes: number },
  rates: Record<string, number>,
): Record<string, HoursSummary> {
  const days = new Set(weekDays(monday));
  const out: Record<string, HoursSummary> = {};
  for (const id of employeeIds) {
    const mine = shifts.filter((s) => s.employee_id === id && days.has(s.shift_date));
    out[id] = summarizeHours(mine, now, rates[id] ?? null);
  }
  return out;
}

/** 450 → "7h 30m", 480 → "8h", 0 → "0h" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Problems with a shift form, or null if it's fine. */
export function validateShift(s: Pick<Shift, "start_time" | "end_time" | "break_minutes">): string | null {
  if (!s.start_time || !s.end_time) return "Enter a start and end time.";
  if (timeToMinutes(s.start_time) === timeToMinutes(s.end_time)) return "Start and end can't be the same time.";
  if (s.break_minutes < 0) return "Break can't be negative.";
  if (s.break_minutes >= spanMinutes(s)) return "Break is longer than the shift.";
  return null;
}
