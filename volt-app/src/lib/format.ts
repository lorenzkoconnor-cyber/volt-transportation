// ─── Shared display formatters ────────────────────────────────────────────────

// "08:00:00" | "08:00" → "8:00 AM"
export function formatTime12h(time: string): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const hour = parseInt(hStr, 10);
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${mStr ?? "00"} ${ampm}`;
}

// 11800 → "$118" ; 11850 → "$118.50"
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString()}`
    : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// "2026-07-18" → "Jul 18" (timezone-safe)
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "2026-07-18" → "Friday, July 18, 2026" (timezone-safe)
export function formatDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Timestamp → Eastern date and time, e.g. "Nov 3, 2026" + "2:14 PM ET".
// Used for when a reservation was booked.
export function formatEasternDateTime(ts: string): { date: string; time: string } {
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts);
  const tz = "America/New_York";
  return {
    date: d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }) + " ET",
  };
}

// Local date as "YYYY-MM-DD" (avoids toISOString UTC shift)
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Today's date in Columbus/Atlanta as "YYYY-MM-DD", whatever the server's or
// browser's own time zone is. Volt's schedule and deadlines are all Eastern.
export function easternToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// 1440 → "24 hours", 90 → "90 minutes" — for the online booking cutoff.
export function noticeWords(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;
}

// First Eastern date that can still have a departure outside the online
// booking cutoff (with 24h notice, never today) — for rider date pickers.
export function earliestOnlineDate(cutoffMinutes: number, now: Date = new Date()): string {
  return easternToday(new Date(now.getTime() + cutoffMinutes * 60_000));
}
