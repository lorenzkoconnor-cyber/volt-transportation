"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateShort } from "@/lib/format";
import {
  EVENT_CATEGORIES, repeatDates, addMonths, type EventCategory, type Repeat, type StaffItem,
} from "@/lib/calendar";
import { Loader2, X, Trash2, AlertTriangle } from "lucide-react";

// Add / edit / delete a staff calendar event. Only owners and managers get
// here — and RLS on calendar_events refuses anyone else's writes anyway.

const field = "w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] [color-scheme:dark]";

export function CalendarEventModal({
  event, defaultDate, onClose, onSaved,
}: {
  event: StaffItem | null;     // null = new event
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = createClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { employee } = useAuth();
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState<EventCategory>(event?.category ?? "cleaning");
  const [date, setDate] = useState(event?.date ?? defaultDate);
  const [allDay, setAllDay] = useState(event ? !event.time : false);
  const [start, setStart] = useState(event?.time ?? "09:00");
  const [end, setEnd] = useState(event?.endTime ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [until, setUntil] = useState(addMonths(defaultDate, 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dates = event ? [date] : repeatDates(date, repeat, until);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allDay && end && end <= start) { setError("End time must be after the start time."); return; }
    setBusy(true);
    setError("");
    const fields = {
      title: title.trim(),
      category,
      notes: notes.trim() || null,
      start_time: allDay ? null : start,
      end_time: allDay || !end ? null : end,
    };
    let err;
    if (event) {
      ({ error: err } = await sb.from("calendar_events").update({ ...fields, event_date: date }).eq("id", event.id));
    } else {
      const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
      const createdByName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : null;
      ({ error: err } = await sb.from("calendar_events").insert(
        dates.map((d) => ({ ...fields, event_date: d, series_id: seriesId, created_by_name: createdByName }))
      ));
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  const remove = async (scope: "one" | "following") => {
    if (!event) return;
    setBusy(true);
    setError("");
    let q = sb.from("calendar_events").delete();
    q = scope === "following" && event.seriesId
      ? q.eq("series_id", event.seriesId).gte("event_date", event.date)
      : q.eq("id", event.id);
    const { error: err } = await q;
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto glass rounded-2xl p-6 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">{event ? "Edit Event" : "Add Event"}</h2>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-white transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={save} className="space-y-4">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">What *</Label>
            <Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Clean the lobby"
              className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#FCC300]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Type</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} className={field}>
                {EVENT_CATEGORIES.map((c) => <option key={c.value} value={c.value} className="bg-[#171717]">{c.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Date *</Label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#D4D4D8] cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="w-4 h-4 accent-[#FCC300]" />
            All day (no set time)
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Start *</Label>
                <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={field} />
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">End (optional)</Label>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
              </div>
            </div>
          )}
          {!event && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Repeat</Label>
                <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className={field}>
                  <option value="none" className="bg-[#171717]">Doesn&apos;t repeat</option>
                  <option value="weekly" className="bg-[#171717]">Every week</option>
                  <option value="biweekly" className="bg-[#171717]">Every 2 weeks</option>
                  <option value="monthly" className="bg-[#171717]">Every month</option>
                </select>
              </div>
              {repeat !== "none" && (
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Until</Label>
                  <input type="date" required min={date} value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
                </div>
              )}
            </div>
          )}
          {!event && repeat !== "none" && (
            <p className="text-[#A1A1AA] text-xs -mt-2">
              Adds {dates.length} event{dates.length !== 1 ? "s" : ""}
              {dates.length > 1 && ` (${formatDateShort(dates[0])} – ${formatDateShort(dates[dates.length - 1])})`}
              {dates.length === 60 && " — the most at once"}.
            </p>
          )}
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Notes</Label>
            <Textarea maxLength={1000} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Who, what to bring, anything staff should know"
              className="bg-white/5 border-white/10 text-white rounded-xl focus:border-[#FCC300]" />
          </div>
          <Button type="submit" disabled={busy || !title.trim()}
            className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-11 rounded-xl disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : event ? "Save Changes" : "Add to Calendar"}
          </Button>
        </form>

        {event && (
          <div className="mt-4 pt-4 border-t border-white/10">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" /> Delete event
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-[#D4D4D8] mr-1">Delete:</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => remove("one")}
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10">This day only</Button>
                {event.seriesId && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove("following")}
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10">This and later repeats</Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)} className="text-[#A1A1AA]">Keep it</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
