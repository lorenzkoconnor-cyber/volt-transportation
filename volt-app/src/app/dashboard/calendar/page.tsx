"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { useAppSettings } from "@/context/SettingsContext";
import { canAccessRoute } from "@/lib/permissions";
import { easternToday, formatTime12h, formatDateLong } from "@/lib/format";
import { atlSpot } from "@/lib/trip-timeline";
import {
  addDays, addMonths, monthGrid, monthStart, weekday, tripItem, staffItem, groupByDay, categoryLabel,
  type CalendarItem, type TripItem, type StaffItem,
} from "@/lib/calendar";
import { CalendarEventModal } from "@/components/admin/CalendarEventModal";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Plus, Loader2, AlertTriangle, Truck, Plane, Sparkles, Wrench, Users2,
  ClipboardList, StickyNote, ChevronDown, Pencil, Radio,
} from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Team calendar: a 7-day overview, then the month, then everything happening
// on the chosen day. Booked trips come straight from `trips` (so a new booking
// shows up by itself); owners/managers add staff events (calendar_events).
// Realtime keeps every open calendar current.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STYLE = {
  departure: { card: "bg-[#2563EB] text-white", dot: "bg-[#3B82F6]", sub: "text-blue-100" },
  pickup:    { card: "bg-[#15803D] text-white", dot: "bg-[#22C55E]", sub: "text-green-100" },
  staff:     { card: "bg-[#FCC300] text-[#0A0A0A]", dot: "bg-[#FCC300]", sub: "text-[#0A0A0A]/70" },
} as const;

const STAFF_ICONS = { cleaning: Sparkles, maintenance: Wrench, meeting: Users2, task: ClipboardList, other: StickyNote } as const;

function shortDate(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", opts);
}

function itemIcon(it: CalendarItem) {
  if (it.type !== "staff") return it.type === "departure" ? Truck : Plane;
  return STAFF_ICONS[it.category] ?? StickyNote;
}

function vanLine(t: TripItem): string {
  if (t.vans.length === 0) return "No van assigned";
  return t.vans.map((v) => `${v.vehicle}${v.driver ? ` · ${v.driver}` : " · no driver"}`).join(", ");
}

export default function CalendarPage() {
  const sb = createClient() as any;
  const role = useDashboardRole();
  const settings = useAppSettings();
  const canEdit = role === "owner" || role === "manager";
  const canOpenBookings = canAccessRoute("/dashboard/reservations", role);

  const today = easternToday();
  const [weekStart, setWeekStart] = useState(today);
  const [monthAnchor, setMonthAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<{ event: StaffItem | null; date: string } | null>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const grid = useMemo(() => monthGrid(monthAnchor), [monthAnchor]);
  const lo = weekStart < grid[0][0] ? weekStart : grid[0][0];
  const hi = weekDays[6] > grid.at(-1)!.at(-1)! ? weekDays[6] : grid.at(-1)!.at(-1)!;

  const load = useCallback(async () => {
    const [tripsRes, eventsRes] = await Promise.all([
      sb.from("trips")
        .select(
          "id, departure_date, departure_time, seats_booked, total_capacity, status, " +
          "route:routes(origin_key, duration_minutes), " +
          "trip_vehicles(vehicle:vehicles(name), driver:drivers(first_name, last_name))"
        )
        .gte("departure_date", lo).lte("departure_date", hi)
        .gt("seats_booked", 0)
        .neq("status", "cancelled")
        .order("departure_time")
        .limit(2000),
      sb.from("calendar_events")
        .select("id, title, notes, category, event_date, start_time, end_time, series_id, created_by_name")
        .gte("event_date", lo).lte("event_date", hi)
        .limit(2000),
    ]);
    if (tripsRes.error || eventsRes.error) {
      setError((tripsRes.error ?? eventsRes.error).message);
    } else {
      setError("");
      setItems([
        ...(tripsRes.data ?? []).map((t: any) => tripItem(t, settings.schedule.toAtl.durationMinutes)),
        ...(eventsRes.data ?? []).map(staffItem),
      ]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  // Auto-update: realtime on bookings (trips seat counts), van/driver
  // assignments and staff events, plus a slow poll and a refresh on refocus
  // in case the realtime connection drops.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => loadRef.current(), 400); };
    const channel = sb.channel("staff-calendar")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_vehicles" }, soon)
      .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => loadRef.current(), 120_000);
    const onFocus = () => { if (document.visibilityState === "visible") loadRef.current(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDay = useMemo(() => groupByDay(items), [items]);

  const pick = (date: string, itemId?: string) => {
    setSelected(date);
    if (itemId) setExpanded(itemId);
    if (date < weekStart || date > weekDays[6]) setWeekStart(date);
    if (monthStart(date) !== monthStart(monthAnchor)) setMonthAnchor(date);
    if (itemId) setTimeout(() => document.getElementById("day-agenda")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const goToday = () => { setWeekStart(today); setMonthAnchor(today); setSelected(today); };
  const moveWeek = (n: number) => {
    const next = addDays(weekStart, 7 * n);
    setWeekStart(next);
    setMonthAnchor(next);
  };

  const openItem = (it: CalendarItem) => {
    if (it.type === "staff" && canEdit) setModal({ event: it, date: it.date });
    else pick(it.date, it.id);
  };

  const dayItems = byDay.get(selected) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Volt Calendar</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5 flex items-center gap-2">
            7-day overview · {shortDate(weekDays[0])} – {shortDate(weekDays[6], { month: "short", day: "numeric", year: "numeric" })}
            {live && (
              <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                <Radio className="w-3 h-3" /> Live
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={goToday} className="border-white/15 text-white hover:bg-white/5">Today</Button>
          <div className="flex">
            <Button variant="outline" size="sm" onClick={() => moveWeek(-1)} aria-label="Previous 7 days"
              className="border-white/15 text-white hover:bg-white/5 rounded-r-none"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => moveWeek(1)} aria-label="Next 7 days"
              className="border-white/15 text-white hover:bg-white/5 rounded-l-none border-l-0"><ChevronRight className="w-4 h-4" /></Button>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setModal({ event: null, date: selected })}
              className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
              <Plus className="w-4 h-4 mr-1" /> Add Event
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#A1A1AA]">
        <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${STYLE.departure.dot}`} />Depart from Volt (to ATL)</span>
        <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${STYLE.pickup.dot}`} />Pick up at ATL</span>
        <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${STYLE.staff.dot}`} />Staff events &amp; tasks</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* 7-day overview */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="grid grid-cols-7 gap-2 min-w-[980px]">
          {weekDays.map((d) => {
            const list = byDay.get(d) ?? [];
            const isToday = d === today;
            const isSel = d === selected;
            return (
              <div key={d} className={`rounded-2xl border p-2 flex flex-col min-h-[240px] ${
                isSel ? "border-[#FCC300]/70 bg-white/[0.04]" : "border-white/8 bg-white/[0.02]"
              }`}>
                <button onClick={() => pick(d)} className="flex items-start justify-between px-1.5 pt-1 pb-2 text-left">
                  <div>
                    <div className={`font-semibold ${isToday ? "text-[#FCC300]" : "text-white"}`}>
                      {DAY_NAMES[weekday(d)]}{isToday && <span className="ml-1 text-[10px] uppercase tracking-wider">Today</span>}
                    </div>
                    <div className="text-[#A1A1AA] text-sm">{shortDate(d)}</div>
                  </div>
                  {list.length > 0 && (
                    <span className="w-7 h-7 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center justify-center">{list.length}</span>
                  )}
                </button>
                <div className="space-y-1.5 flex-1">
                  {loading && list.length === 0 && <div className="h-12 rounded-lg bg-white/5 animate-pulse" />}
                  {!loading && list.length === 0 && <div className="text-[#52525B] text-xs px-1.5">Nothing scheduled</div>}
                  {list.map((it) => {
                    const Icon = itemIcon(it);
                    const s = STYLE[it.type];
                    return (
                      <button key={it.id} onClick={() => openItem(it)}
                        className={`w-full text-left rounded-lg px-2 py-1.5 ${s.card} hover:brightness-110 transition`}>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-sm font-semibold tabular-nums">{it.time ? formatTime12h(it.time) : "All day"}</span>
                        </div>
                        {it.type === "staff" ? (
                          <>
                            <div className="text-xs font-medium leading-snug">{it.title}</div>
                            <div className={`text-[11px] ${s.sub}`}>{categoryLabel(it.category)}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-medium leading-snug">{it.type === "departure" ? "Depart from Volt" : "Pick up at ATL"}</div>
                            <div className={`text-[11px] leading-snug ${s.sub}`}>
                              {it.passengers} passenger{it.passengers !== 1 ? "s" : ""}
                              {it.type === "pickup"
                                ? ` · leave Volt ${formatTime12h(it.leaveVolt.time)}`
                                : ` · ATL ~${formatTime12h(it.atAtl.time)}`}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Monthly overview */}
        <div className="glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold text-lg">Monthly Overview</h2>
              <p className="text-[#A1A1AA] text-sm">{shortDate(monthAnchor, { month: "long", year: "numeric" })}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex">
                <Button variant="outline" size="sm" onClick={() => setMonthAnchor(addMonths(monthStart(monthAnchor), -1))} aria-label="Previous month"
                  className="border-white/15 text-white hover:bg-white/5 rounded-r-none"><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setMonthAnchor(addMonths(monthStart(monthAnchor), 1))} aria-label="Next month"
                  className="border-white/15 text-white hover:bg-white/5 rounded-l-none border-l-0"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-[#A1A1AA] font-medium mb-1">
            {DAY_NAMES.map((n) => <div key={n} className="py-1">{n}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map((d) => {
              const list = byDay.get(d) ?? [];
              const dep = list.filter((i) => i.type === "departure").length;
              const pu = list.filter((i) => i.type === "pickup").length;
              const st = list.filter((i) => i.type === "staff").length;
              const inMonth = d.slice(0, 7) === monthAnchor.slice(0, 7);
              const isSel = d === selected;
              const isToday = d === today;
              return (
                <button key={d} onClick={() => pick(d)}
                  className={`min-h-[64px] sm:min-h-[84px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                    isSel ? "border-[#FCC300] bg-[#FCC300]/10" : "border-white/6 hover:bg-white/5"
                  } ${inMonth ? "" : "opacity-40"}`}>
                  <div className={`text-sm font-semibold ${isToday ? "text-[#FCC300]" : "text-white"}`}>{Number(d.slice(8))}</div>
                  <div className="mt-1 space-y-0.5 text-[11px] text-[#D4D4D8] leading-tight">
                    {dep > 0 && <div className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${STYLE.departure.dot}`} />{dep}<span className="hidden md:inline"> depart{dep !== 1 ? "s" : ""}</span></div>}
                    {pu > 0 && <div className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${STYLE.pickup.dot}`} />{pu}<span className="hidden md:inline"> pickup{pu !== 1 ? "s" : ""}</span></div>}
                    {st > 0 && <div className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${STYLE.staff.dot}`} />{st}<span className="hidden md:inline"> task{st !== 1 ? "s" : ""}</span></div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day agenda */}
        <div id="day-agenda" className="glass rounded-2xl p-4 sm:p-5 scroll-mt-20">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-white font-semibold text-lg">{formatDateLong(selected)}</h2>
              <p className="text-[#A1A1AA] text-sm">
                {dayItems.length === 0 ? "Nothing scheduled" : `${dayItems.length} item${dayItems.length !== 1 ? "s" : ""}`}
                {selected === today && " · today"}
              </p>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setModal({ event: null, date: selected })}
                className="border-white/15 text-white hover:bg-white/5"><Plus className="w-4 h-4" /></Button>
            )}
          </div>
          <div className="space-y-2">
            {dayItems.map((it) =>
              it.type === "staff"
                ? <StaffRow key={it.id} item={it} canEdit={canEdit} onEdit={() => setModal({ event: it, date: it.date })} />
                : <TripRow key={it.id} item={it} open={expanded === it.id} canOpenBookings={canOpenBookings}
                    onToggle={() => setExpanded(expanded === it.id ? null : it.id)} />
            )}
          </div>
        </div>
      </div>

      {modal && (
        <CalendarEventModal
          event={modal.event}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

function StaffRow({ item, canEdit, onEdit }: { item: StaffItem; canEdit: boolean; onEdit: () => void }) {
  const Icon = STAFF_ICONS[item.category] ?? StickyNote;
  return (
    <div className="rounded-xl border border-[#FCC300]/25 bg-[#FCC300]/[0.06] p-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-[#FCC300] text-[#0A0A0A] flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold">
            {item.time ? `${formatTime12h(item.time)}${item.endTime ? ` – ${formatTime12h(item.endTime)}` : ""}` : "All day"}
          </div>
          <div className="text-white">{item.title}</div>
          <div className="text-[#A1A1AA] text-xs">{categoryLabel(item.category)}{item.createdByName ? ` · added by ${item.createdByName}` : ""}</div>
          {item.notes && <p className="text-[#D4D4D8] text-sm mt-1.5 whitespace-pre-line">{item.notes}</p>}
        </div>
        {canEdit && (
          <button onClick={onEdit} className="text-[#A1A1AA] hover:text-white p-1" aria-label="Edit event">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function TripRow({ item, open, onToggle, canOpenBookings }: {
  item: TripItem; open: boolean; onToggle: () => void; canOpenBookings: boolean;
}) {
  const isPickup = item.type === "pickup";
  const Icon = isPickup ? Plane : Truck;
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03]">
      <button onClick={onToggle} className="w-full flex items-start gap-3 p-3 text-left">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isPickup ? STYLE.pickup.card : STYLE.departure.card}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold">
            {formatTime12h(item.time)} · {isPickup ? "Pick up at ATL" : "Depart from Volt"}
          </div>
          <div className="text-[#D4D4D8] text-sm">
            {isPickup
              ? <>Leave Volt by <b className="text-white">{formatTime12h(item.leaveVolt.time)}</b>{item.leaveVolt.date !== item.date && " (day before)"} · back ~{formatTime12h(item.backAtVolt!.time)}</>
              : <>Drop off at ATL ~<b className="text-white">{formatTime12h(item.atAtl.time)}</b>{item.atAtl.date !== item.date && " (next day)"}</>}
          </div>
          <div className="text-[#A1A1AA] text-xs mt-0.5">
            {item.passengers}/{item.capacity} passengers · {vanLine(item)}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#A1A1AA] mt-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <TripRiders item={item} canOpenBookings={canOpenBookings} />}
    </div>
  );
}

// Who's on the trip, their flight and exactly which ATL terminal — loaded
// when a trip is opened.
function TripRiders({ item, canOpenBookings }: { item: TripItem; canOpenBookings: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (createClient() as any)
      .from("reservations")
      .select(
        "id, confirmation_number, adults, children, status, trip_id, return_trip_id, " +
        "customer:customers(first_name, last_name, phone), " +
        "reservation_flights(leg, airline, flight_number, terminal, flight_date, flight_time)"
      )
      .or(`trip_id.eq.${item.id},return_trip_id.eq.${item.id}`)
      .neq("status", "cancelled")
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setRows(data ?? []);
      });
    return () => { cancelled = true; };
  }, [item.id]);

  if (err) return <p className="px-3 pb-3 text-red-400 text-sm">{err}</p>;
  if (!rows) return <div className="px-3 pb-3"><Loader2 className="w-4 h-4 text-[#FCC300] animate-spin" /></div>;

  const riders = rows.map((r) => {
    const leg = r.trip_id === item.id ? "outbound" : "return";
    const flight = (r.reservation_flights ?? []).find((f: any) => f.leg === leg) ?? null;
    return { r, flight, spot: atlSpot(flight?.terminal) };
  });
  const spots = new Map<string, number>();
  for (const x of riders) {
    const k = x.spot ?? "Terminal not given";
    spots.set(k, (spots.get(k) ?? 0) + x.r.adults + x.r.children);
  }

  return (
    <div className="border-t border-white/8 px-3 py-3 space-y-3">
      {riders.length > 0 && (
        <div>
          <div className="text-[#A1A1AA] text-xs mb-1">{item.type === "pickup" ? "Pick up at" : "Drop off at"}</div>
          <div className="flex flex-wrap gap-1.5">
            {[...spots].map(([spot, n]) => (
              <span key={spot} className={`text-xs rounded-full px-2.5 py-1 ${spot === "Terminal not given" ? "bg-orange-500/15 text-orange-300" : "bg-white/8 text-white"}`}>
                {spot} · {n}
              </span>
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {riders.map(({ r, flight, spot }) => {
          const name = `${r.customer?.first_name ?? ""} ${r.customer?.last_name ?? ""}`.trim() || "Customer";
          const party = r.adults + r.children;
          return (
            <li key={r.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                {canOpenBookings
                  ? <Link href={`/dashboard/reservations/${r.id}`} className="text-white font-medium hover:text-[#FCC300]">{name}</Link>
                  : <span className="text-white font-medium">{name}</span>}
                <span className="text-[#A1A1AA] text-xs flex-shrink-0">{party} seat{party !== 1 ? "s" : ""}</span>
              </div>
              <div className="text-[#A1A1AA] text-xs">
                {flight
                  ? `${flight.airline} ${flight.flight_number} · ${item.type === "pickup" ? "lands" : "departs"} ${formatTime12h(flight.flight_time.slice(0, 5))} · ${spot}`
                  : "No flight given"}
                {r.customer?.phone ? ` · ${r.customer.phone}` : ""}
              </div>
            </li>
          );
        })}
        {riders.length === 0 && <li className="text-[#A1A1AA] text-sm">No active bookings on this trip.</li>}
      </ul>
      <Link href={`/dashboard/manifest?tripId=${item.id}`} className="inline-block text-[#FCC300] hover:text-[#FFD54A] text-sm font-medium">
        Open manifest →
      </Link>
    </div>
  );
}
