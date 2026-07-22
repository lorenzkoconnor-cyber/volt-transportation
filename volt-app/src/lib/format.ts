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

// Local date as "YYYY-MM-DD" (avoids toISOString UTC shift)
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
