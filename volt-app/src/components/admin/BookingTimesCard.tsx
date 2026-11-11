"use client";

// Reports → "When Bookings Come In": when riders and staff made reservations
// (reservations.created_at, in Eastern time), by day of week, hour of day,
// week and month. It goes by when the booking was made, not the trip date.
// Has its own time span and source filters, separate from the page's period
// buttons, because a week of data is too little for day-of-week patterns.

import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Row {
  created_at: string;
  terms_acceptance: string | null;
  adults: number | null;
  children: number | null;
}

type Span = "30" | "90" | "all";
type Source = "all" | "online" | "staff";

const SPANS: { value: Span; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
const SOURCES: { value: Source; label: string }[] = [
  { value: "all", label: "All bookings" },
  { value: "online", label: "Online" },
  { value: "staff", label: "Staff & walk-in" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TZ = "America/New_York";

// One formatter, reused for every row: weekday, date and hour in Eastern time.
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23",
});

function eastern(ts: string) {
  const p: Record<string, string> = {};
  for (const part of PARTS.formatToParts(new Date(ts))) p[part.type] = part.value;
  return {
    weekday: DAYS.indexOf(p.weekday),               // 0 = Monday
    hour: Number(p.hour) % 24,
    date: `${p.year}-${p.month}-${p.day}`,          // Eastern calendar date
    month: `${p.year}-${p.month}`,
  };
}

// Calendar-date arithmetic on "YYYY-MM-DD" strings (UTC noon avoids DST edges).
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(date: string, weekday: number): string {
  return addDays(date, -weekday);
}
function shortDate(date: string, withYear = false): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}),
  });
}
function monthName(ym: string): string {
  return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}
function hourLabel(h: number, short = false): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? (short ? "a" : " AM") : (short ? "p" : " PM");
  return `${h12}${ampm}`;
}
function joinNames(names: string[]): string {
  return names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

interface Bucket { key: string; label: string; bookings: number; passengers: number }

export default function BookingTimesCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0); // "now" for the 30/90-day cutoffs
  const [error, setError] = useState(false);
  const [span, setSpan] = useState<Span>("all");
  const [source, setSource] = useState<Source>("all");

  // Volt's booking volume is small, so load every booking once and filter here.
  useEffect(() => {
    (async () => {
      const sb = createClient() as any;
      const { data, error: err } = await sb
        .from("reservations")
        .select("created_at, terms_acceptance, adults, children")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });
      setError(!!err);
      setLoadedAt(Date.now());
      setRows(data ?? []);
    })();
  }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    const cutoff = span === "all" ? 0 : loadedAt - Number(span) * 86_400_000;
    const picked = rows
      .filter((r) => new Date(r.created_at).getTime() >= cutoff)
      .filter((r) =>
        source === "all" ? true : source === "online" ? r.terms_acceptance === "online" : r.terms_acceptance !== "online",
      )
      .map((r) => ({ ...eastern(r.created_at), pax: (r.adults ?? 0) + (r.children ?? 0) }));

    const days: Bucket[] = DAYS.map((d, i) => ({ key: String(i), label: d, bookings: 0, passengers: 0 }));
    const hours: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: hourLabel(h), bookings: 0, passengers: 0 }));
    const weekMap = new Map<string, Bucket>();
    const monthMap = new Map<string, Bucket>();

    for (const r of picked) {
      days[r.weekday].bookings++; days[r.weekday].passengers += r.pax;
      hours[r.hour].bookings++; hours[r.hour].passengers += r.pax;
      const wk = mondayOf(r.date, r.weekday);
      const w = weekMap.get(wk) ?? { key: wk, label: "", bookings: 0, passengers: 0 };
      w.bookings++; w.passengers += r.pax; weekMap.set(wk, w);
      const m = monthMap.get(r.month) ?? { key: r.month, label: monthName(r.month), bookings: 0, passengers: 0 };
      m.bookings++; m.passengers += r.pax; monthMap.set(r.month, m);
    }

    // Fill in empty weeks and months between the first booking and now, so
    // a quiet week shows as 0 instead of disappearing. Most recent first.
    const weeks: Bucket[] = [];
    const months: Bucket[] = [];
    if (picked.length) {
      const today = eastern(new Date(loadedAt).toISOString());
      const lastWeek = mondayOf(today.date, today.weekday);
      for (let wk = mondayOf(picked[0].date, picked[0].weekday); wk <= lastWeek; wk = addDays(wk, 7)) {
        const b = weekMap.get(wk) ?? { key: wk, label: "", bookings: 0, passengers: 0 };
        const sameYear = wk.slice(0, 4) === addDays(wk, 6).slice(0, 4);
        b.label = `${shortDate(wk)} – ${shortDate(addDays(wk, 6), !sameYear || wk.slice(0, 4) !== today.date.slice(0, 4))}`;
        if (wk === lastWeek) b.label += " (this week)";
        weeks.unshift(b);
      }
      let [y, mo] = picked[0].month.split("-").map(Number);
      while (`${y}-${String(mo).padStart(2, "0")}` <= today.month) {
        const key = `${y}-${String(mo).padStart(2, "0")}`;
        months.unshift(monthMap.get(key) ?? { key, label: monthName(key), bookings: 0, passengers: 0 });
        mo++; if (mo > 12) { mo = 1; y++; }
      }
    }

    const most = (bs: Bucket[]) => Math.max(...bs.map((b) => b.bookings));
    const least = (bs: Bucket[]) => Math.min(...bs.map((b) => b.bookings));
    const topDay = most(days), lowDay = least(days), topHour = most(hours);

    return {
      total: picked.length,
      days, hours, weeks, months,
      topDay, lowDay, topHour,
      busiestDays: days.filter((d) => d.bookings === topDay).map((d) => d.label),
      slowestDays: days.filter((d) => d.bookings === lowDay).map((d) => d.label),
      peakHours: hours.filter((h) => h.bookings === topHour).map((h) => h.label),
    };
  }, [rows, loadedAt, span, source]);

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? "bg-[#FCC300] text-[#0A0A0A]" : "glass text-[#A1A1AA] hover:text-white"
    }`;
  const tip = (b: Bucket, what: string) =>
    `${what}: ${b.bookings} booking${b.bookings !== 1 ? "s" : ""}, ${b.passengers} passenger${b.passengers !== 1 ? "s" : ""}`;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-white/8 space-y-3">
        <div className="flex items-center gap-2.5">
          <Clock className="w-5 h-5 text-[#FCC300] flex-shrink-0" />
          <div>
            <h2 className="text-white font-bold text-lg">When Bookings Come In</h2>
            <p className="text-[#A1A1AA] text-xs">
              When each reservation was made (not the trip date), in Eastern time. Cancelled bookings aren&apos;t counted.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SPANS.map((s) => (
            <button key={s.value} onClick={() => setSpan(s.value)} aria-pressed={span === s.value} className={pill(span === s.value)}>
              {s.label}
            </button>
          ))}
          <span className="w-px h-4 bg-white/10 mx-1" aria-hidden />
          {SOURCES.map((s) => (
            <button key={s.value} onClick={() => setSource(s.value)} aria-pressed={source === s.value} className={pill(source === s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : error ? (
        <p className="px-6 py-8 text-center text-[#A1A1AA] text-sm">Booking times couldn&apos;t be loaded. Try refreshing the page.</p>
      ) : stats.total === 0 ? (
        <p className="px-6 py-8 text-center text-[#A1A1AA] text-sm">No bookings match these filters.</p>
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/6 border-b border-white/8">
            {[
              { label: "Busiest day", value: joinNames(stats.busiestDays), sub: `${stats.topDay} booking${stats.topDay !== 1 ? "s" : ""}` },
              {
                label: "Slowest day",
                value: stats.slowestDays.length > 3 ? `${stats.slowestDays.length}-way tie` : joinNames(stats.slowestDays),
                sub: `${stats.lowDay} booking${stats.lowDay !== 1 ? "s" : ""}`,
              },
              {
                label: "Peak hour",
                value: stats.peakHours.length > 3 ? `${stats.peakHours.length}-way tie` : joinNames(stats.peakHours),
                sub: `${stats.topHour} booking${stats.topHour !== 1 ? "s" : ""} · ${stats.total} total`,
              },
            ].map((s) => (
              <div key={s.label} className="bg-[#0A0A0A]/40 px-4 sm:px-6 py-3">
                <div className="text-[#A1A1AA] text-xs uppercase tracking-wider">{s.label}</div>
                <div className="text-white font-semibold text-sm mt-0.5">{s.value}</div>
                <div className="text-[#A1A1AA] text-xs">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Day of week */}
          <div className="px-4 sm:px-6 py-5 border-b border-white/8">
            <h3 className="text-white font-semibold text-sm mb-4">Day of week</h3>
            <div className="flex items-end gap-2 sm:gap-3">
              {stats.days.map((d) => {
                const top = d.bookings === stats.topDay && d.bookings > 0;
                return (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5" title={tip(d, d.label)}>
                    <div className="text-white text-xs font-semibold">{d.bookings}</div>
                    <div className="w-full flex items-end h-28">
                      <div
                        className={`w-full rounded-t-md ${top ? "bg-[#FCC300]" : "bg-[#FCC300]/35"}`}
                        style={{ height: `${Math.max(2, (d.bookings / Math.max(1, stats.topDay)) * 100)}%` }}
                      />
                    </div>
                    <div className={`text-xs ${top ? "text-[#FCC300] font-semibold" : "text-[#A1A1AA]"}`}>{d.label.slice(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hour of day */}
          <div className="px-4 sm:px-6 py-5 border-b border-white/8">
            <h3 className="text-white font-semibold text-sm mb-4">Hour of day <span className="text-[#A1A1AA] font-normal">(Eastern)</span></h3>
            <div className="flex items-end gap-[3px] sm:gap-1">
              {stats.hours.map((h, i) => {
                const top = h.bookings === stats.topHour && h.bookings > 0;
                return (
                  <div key={h.key} className="flex-1 min-w-0 flex flex-col items-center gap-1.5" title={tip(h, h.label)}>
                    <div className="text-white text-[10px] font-semibold h-3 leading-3">{h.bookings || ""}</div>
                    <div className="w-full flex items-end h-24">
                      <div
                        className={`w-full rounded-t-sm ${top ? "bg-[#FCC300]" : h.bookings ? "bg-[#FCC300]/35" : "bg-white/8"}`}
                        style={{ height: `${Math.max(2, (h.bookings / Math.max(1, stats.topHour)) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[#A1A1AA] text-[10px] h-3 leading-3 whitespace-nowrap">{i % 3 === 0 ? hourLabel(i, true) : ""}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By week + by month */}
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-white/8">
            {[
              { title: "By week", sub: "Monday–Sunday", items: stats.weeks },
              { title: "By month", sub: "", items: stats.months },
            ].map((list) => {
              const max = Math.max(1, ...list.items.map((b) => b.bookings));
              return (
                <div key={list.title} className="px-4 sm:px-6 py-5 border-b lg:border-b-0 border-white/8 last:border-b-0">
                  <h3 className="text-white font-semibold text-sm mb-3">
                    {list.title} {list.sub && <span className="text-[#A1A1AA] font-normal">({list.sub})</span>}
                  </h3>
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {list.items.map((b) => (
                      <div key={b.key} title={tip(b, b.label)}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-white">{b.label}</span>
                          <span className="text-white font-semibold">
                            {b.bookings} <span className="text-[#A1A1AA] font-normal text-xs">· {b.passengers} pax</span>
                          </span>
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-white/6 overflow-hidden">
                          <div className="h-full rounded-full bg-[#FCC300]" style={{ width: `${(b.bookings / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
