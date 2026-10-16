"use client";

// Settings → Schedule & Service: daily departure times, and blackout dates /
// service pauses.

import { useState } from "react";
import { CalendarClock, CalendarOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayTime12h } from "@/lib/booking";
import { Card, Notice, SaveButton, Toggle, inputClass, settingsPost, wideInputClass } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROUTE_LABEL: Record<string, string> = { columbus: "Columbus → ATL", atl: "ATL → Columbus" };

export function ScheduleCard({ routes, onSaved }: { routes: any[]; onSaved: () => void }) {
  const [rows, setRows] = useState(() => routes.map((r) => ({
    id: r.id, origin: r.origin_key,
    first: r.first_departure_time.slice(0, 5), last: r.last_departure_time.slice(0, 5), interval: r.departure_interval_minutes,
  })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (id: string, k: string, v: any) => setRows((p) => p.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  const preview = (r: (typeof rows)[number]) => {
    if (!/^\d\d:\d\d$/.test(r.first) || !/^\d\d:\d\d$/.test(r.last) || !(r.interval >= 15)) return "";
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const times: string[] = [];
    for (let m = toMin(r.first); m <= toMin(r.last) && times.length < 30; m += r.interval) {
      times.push(displayTime12h(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`));
    }
    return `${times.length} departures a day: ${times.join(", ")}`;
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const d = await settingsPost({ action: "save_schedule", routes: rows });
      setMsg({
        ok: true,
        text: d.changed
          ? `Schedule saved. Upcoming departures: ${d.added} added, ${d.removed} empty ones removed` +
            (d.kept_with_riders ? `, ${d.kept_with_riders} with riders kept at their old times (move them in Dispatch).` : ".")
          : "No changes to save.",
      });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
    setSaving(false);
  };

  return (
    <Card icon={CalendarClock} title="Daily Schedule"
      description="When vans leave each day, 7 days a week. Saving updates every upcoming day: new times are added, empty departures that no longer fit are removed, and any departure with riders on it is kept.">
      {rows.map((r) => (
        <div key={r.id} className="space-y-2">
          <div className="text-white text-sm font-medium">{ROUTE_LABEL[r.origin] ?? r.origin}</div>
          <div className="flex items-center gap-2 flex-wrap text-sm text-[#A1A1AA]">
            <span>First</span>
            <input type="time" value={r.first} onChange={(e) => set(r.id, "first", e.target.value)} className={`${inputClass} w-32 text-left`} />
            <span>Last</span>
            <input type="time" value={r.last} onChange={(e) => set(r.id, "last", e.target.value)} className={`${inputClass} w-32 text-left`} />
            <span>every</span>
            <input type="number" min={15} max={1440} step={15} value={r.interval}
              onChange={(e) => set(r.id, "interval", Number(e.target.value))} className={inputClass} />
            <span>min</span>
          </div>
          <p className="text-[#A1A1AA] text-xs">{preview(r)}</p>
        </div>
      ))}
      <Notice msg={msg} />
      <SaveButton saving={saving} onClick={save} label="Save Schedule" />
    </Card>
  );
}

const DIRECTION_LABEL: Record<string, string> = { both: "Both directions", to_atl: "Columbus → ATL only", from_atl: "ATL → Columbus only" };
const etString = (iso: string) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const todayEt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function BlackoutsCard({ blackouts, onSaved }: { blackouts: any[]; onSaved: () => void }) {
  const [now] = useState(Date.now);
  const [form, setForm] = useState({
    startDate: todayEt(), startTime: "00:00", endDate: todayEt(), endTime: "23:59",
    direction: "both", reason: "", cancelBookings: false,
  });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: any) => { setForm((p) => ({ ...p, [k]: v })); setConfirming(false); };

  const create = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const d = await settingsPost({ action: "create_blackout", ...form });
      setMsg({
        ok: true,
        text: `Service paused. ${d.tripsCancelled} departure${d.tripsCancelled === 1 ? "" : "s"} cancelled` +
          (d.affected.length
            ? `; ${d.affected.length} booking${d.affected.length === 1 ? "" : "s"} ${form.cancelBookings ? "cancelled and fully refunded" : "notified — follow up to rebook or refund"} (staff were alerted with the list).`
            : "; no one was booked."),
      });
      setForm((p) => ({ ...p, reason: "" }));
      setConfirming(false);
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    setMsg(null);
    try {
      const d = await settingsPost({ action: "remove_blackout", id });
      setMsg({ ok: true, text: `Removed. ${d.reopened} departure${d.reopened === 1 ? "" : "s"} reopened for booking (cancelled bookings stay cancelled).` });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not remove it." });
    }
  };

  const active = blackouts.filter((b) => !b.removed_at && new Date(b.ends_at).getTime() > now);
  const past = blackouts.filter((b) => !active.includes(b));

  return (
    <Card icon={CalendarOff} title="Blackout Dates & Service Pauses"
      description="Stop service for a holiday, ice storm or van problem. Departures in the range are cancelled and disappear from booking (times are Eastern).">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">From</span>
          <div className="flex gap-2">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={wideInputClass} />
            <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={`${wideInputClass} w-32`} />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Until</span>
          <div className="flex gap-2">
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={wideInputClass} />
            <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className={`${wideInputClass} w-32`} />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Which vans</span>
          <select value={form.direction} onChange={(e) => set("direction", e.target.value)} className={wideInputClass}>
            {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k} className="bg-[#111]">{v}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Reason (riders see this)</span>
          <input value={form.reason} maxLength={200} placeholder="e.g. ice storm on I-185" onChange={(e) => set("reason", e.target.value)} className={wideInputClass} />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <Toggle on={form.cancelBookings} onChange={(v) => set("cancelBookings", v)} label="Cancel and refund affected bookings" />
        <span className="text-[#A1A1AA]">
          <span className="text-white">Cancel and fully refund riders already booked</span> (no fee — Volt cancelled).
          Off: riders are texted/emailed that we&apos;ll contact them to rebook or refund, and staff get the list.
          Round trips with either leg in the range are cancelled whole.
        </span>
      </label>
      <Notice msg={msg} />
      {confirming ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[#FFE08A]">Pause service and message affected riders now?</span>
          <Button size="sm" disabled={saving} onClick={create} className="bg-red-500 hover:bg-red-600 text-white">
            {saving ? "Working…" : "Yes, pause service"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)} className="border-white/15 text-white hover:bg-white/5">Cancel</Button>
        </div>
      ) : (
        <SaveButton saving={false} onClick={() => setConfirming(true)} label="Add Service Pause" />
      )}

      {active.length > 0 && (
        <div className="space-y-2 border-t border-white/8 pt-4">
          <div className="text-white text-sm font-medium">Active &amp; upcoming</div>
          {active.map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-3 bg-white/5 rounded-xl px-4 py-3 text-sm">
              <div>
                <div className="text-white">{etString(b.starts_at)} – {etString(b.ends_at)}</div>
                <div className="text-[#A1A1AA] text-xs mt-0.5">
                  {DIRECTION_LABEL[b.direction]} · {b.reason} · by {b.created_by_name ?? "staff"}
                  {b.affected && ` · ${b.affected.trips} departures, ${b.affected.reservations?.length ?? 0} bookings affected`}
                </div>
              </div>
              <button onClick={() => remove(b.id)} className="text-[#A1A1AA] hover:text-red-400 flex items-center gap-1 text-xs flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <details className="text-sm">
          <summary className="text-[#A1A1AA] cursor-pointer">Past &amp; removed ({past.length})</summary>
          <div className="space-y-1 mt-2">
            {past.map((b) => (
              <div key={b.id} className="text-[#A1A1AA] text-xs">
                {etString(b.starts_at)} – {etString(b.ends_at)} · {b.reason}{b.removed_at ? ` · removed by ${b.removed_by_name ?? "staff"}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
