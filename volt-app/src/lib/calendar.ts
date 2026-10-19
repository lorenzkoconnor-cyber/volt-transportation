// ─── Staff calendar ───────────────────────────────────────────────────────────
// Pure helpers for /dashboard/calendar: date math on "YYYY-MM-DD" strings,
// turning booked trips + staff events into one sorted list per day, and the
// dates a repeating event lands on. No I/O.

import { shiftClock, legTimes, type ClockPoint } from "./trip-timeline.ts";

export type EventCategory = "cleaning" | "maintenance" | "meeting" | "task" | "other";

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Van maintenance" },
  { value: "meeting", label: "Meeting" },
  { value: "task", label: "Staff task" },
  { value: "other", label: "Other" },
];

export function categoryLabel(c: string): string {
  return EVENT_CATEGORIES.find((x) => x.value === c)?.label ?? "Other";
}

export function addDays(date: string, days: number): string {
  return shiftClock(date, "12:00", days * 24 * 60).date;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "2026-10-19" → "2026-10-01". */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Same day-of-month `n` months later, clamped (Jan 31 + 1 → Feb 28). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The Sunday-to-Saturday weeks covering the month that `date` is in (5 or 6 rows). */
export function monthGrid(date: string): string[][] {
  const first = monthStart(date);
  const nextMonth = addMonths(first, 1);
  let day = addDays(first, -weekday(first));
  const weeks: string[][] = [];
  while (day < nextMonth) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
    weeks.push(week);
  }
  return weeks;
}

export type Repeat = "none" | "weekly" | "biweekly" | "monthly";

/** Every date a repeating event lands on, from `start` through `until` (max `cap`). */
export function repeatDates(start: string, repeat: Repeat, until: string | null, cap = 60): string[] {
  if (repeat === "none" || !until || until < start) return [start];
  const out: string[] = [];
  for (let i = 0; out.length < cap; i++) {
    const d = repeat === "monthly" ? addMonths(start, i) : addDays(start, i * (repeat === "weekly" ? 7 : 14));
    if (d > until) break;
    out.push(d);
  }
  return out;
}

// ─── Calendar items ───────────────────────────────────────────────────────────

export interface TripItem {
  type: "departure" | "pickup";
  id: string;                 // trip id
  date: string;
  time: string;               // "04:00" — leave Volt (departure) / pickup at ATL (pickup)
  passengers: number;
  capacity: number;
  leaveVolt: ClockPoint;
  atAtl: ClockPoint;          // drop-off (departure) / pickup (pickup)
  backAtVolt?: ClockPoint;
  vans: { vehicle: string; driver: string | null }[];
  status: string;
}

export interface StaffItem {
  type: "staff";
  id: string;
  date: string;
  time: string | null;        // null = all day
  endTime: string | null;
  title: string;
  notes: string | null;
  category: EventCategory;
  seriesId: string | null;
  createdByName: string | null;
}

export type CalendarItem = TripItem | StaffItem;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A trips row (with route + trip_vehicles) as a calendar item. */
export function tripItem(t: any, fallbackRouteMinutes = 120): TripItem {
  const lt = legTimes(t.route?.origin_key ?? "columbus", t.departure_date, t.departure_time, t.route?.duration_minutes ?? fallbackRouteMinutes);
  return {
    type: lt.kind === "to_atl" ? "departure" : "pickup",
    id: t.id,
    date: t.departure_date,
    time: t.departure_time.slice(0, 5),
    passengers: t.seats_booked ?? 0,
    capacity: t.total_capacity ?? 0,
    leaveVolt: lt.leaveVolt,
    atAtl: lt.atAtl,
    backAtVolt: lt.backAtVolt,
    vans: (t.trip_vehicles ?? []).map((a: any) => ({
      vehicle: a.vehicle?.name ?? "Van",
      driver: a.driver ? `${a.driver.first_name} ${a.driver.last_name}`.trim() : null,
    })),
    status: t.status,
  };
}

/** A calendar_events row as a calendar item. */
export function staffItem(e: any): StaffItem {
  return {
    type: "staff",
    id: e.id,
    date: e.event_date,
    time: e.start_time ? e.start_time.slice(0, 5) : null,
    endTime: e.end_time ? e.end_time.slice(0, 5) : null,
    title: e.title,
    notes: e.notes ?? null,
    category: e.category,
    seriesId: e.series_id ?? null,
    createdByName: e.created_by_name ?? null,
  };
}

/** Items grouped by date, each day sorted by time (all-day staff items first). */
export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const list = map.get(it.date) ?? [];
    list.push(it);
    map.set(it.date, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.time ?? "") .localeCompare(b.time ?? ""));
  }
  return map;
}
