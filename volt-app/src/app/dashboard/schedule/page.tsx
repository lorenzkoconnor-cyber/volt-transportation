"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { canViewFinancials } from "@/lib/permissions";
import { easternToday, formatCents, formatDateLong, formatDateShort, formatTime12h } from "@/lib/format";
import {
  addDays, easternNow, formatMinutes, isOvernight, shiftMinutes, summarizeHours, summarizeWeek,
  validateShift, weekDays, weekStart, type Shift, type ShiftKind,
} from "@/lib/schedule";
import StatCard from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle, CalendarClock, ChevronLeft, ChevronRight, Clock, Copy, DollarSign, Hourglass,
  Loader2, Plus, Timer, Trash2, X,
} from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Emp { id: string; first_name: string; last_name: string; role: string; is_active: boolean }

interface ShiftForm {
  id?: string;
  employee_id: string;
  kind: ShiftKind;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", manager: "Manager", office_staff: "Office", driver: "Driver",
};

// "08:00:00" → "8a", "16:30" → "4:30p"
function shortTime(t: string): string {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}
const hhmm = (t: string) => t.slice(0, 5);
const dayName = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });

export default function SchedulePage() {
  const supabase = createClient();
  const sb = supabase as any;
  const { employee } = useAuth();
  const role = useDashboardRole();
  const isAdmin = role === "owner" || role === "manager";
  const showPay = canViewFinancials(role);

  const [monday, setMonday] = useState(() => weekStart(easternToday()));
  const [emps, setEmps] = useState<Emp[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ShiftForm | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rateEdit, setRateEdit] = useState<{ id: string; value: string } | null>(null);
  const [now, setNow] = useState(() => easternNow());

  const days = useMemo(() => weekDays(monday), [monday]);
  const sunday = days[6];
  const today = now.date;

  // Keep "still to work" current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(easternNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!role) return;
    const shiftQ = sb.from("employee_shifts")
      .select("id, employee_id, kind, shift_date, start_time, end_time, break_minutes, notes")
      .gte("shift_date", days[0]).lte("shift_date", days[6])
      .order("shift_date").order("start_time");
    if (isAdmin) {
      const [e, s, r] = await Promise.all([
        sb.from("employees").select("id, first_name, last_name, role, is_active").order("first_name"),
        shiftQ,
        sb.from("employee_pay_rates").select("employee_id, hourly_rate_cents"),
      ]);
      const err = e.error ?? s.error ?? r.error;
      setError("");
      if (err) setError(err.message.includes("employee_shifts") || err.message.includes("employee_pay_rates")
        ? "Schedules aren't set up in the database yet (migration 043)."
        : err.message);
      setEmps(e.data ?? []);
      setShifts(s.data ?? []);
      setRates(Object.fromEntries((r.data ?? []).map((x: any) => [x.employee_id, x.hourly_rate_cents])));
    } else {
      const s = await shiftQ;
      setError("");
      if (s.error) setError(s.error.message);
      setShifts((s.data ?? []).filter((x: Shift) => x.employee_id === employee?.id));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isAdmin, days, employee?.id]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  // Active staff, plus anyone inactive who still has hours this week.
  const rows = useMemo(() => {
    const withShifts = new Set(shifts.map((s) => s.employee_id));
    const order: Record<string, number> = { owner: 0, manager: 1, office_staff: 2, driver: 3 };
    return emps
      .filter((e) => e.is_active || withShifts.has(e.id))
      .sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.first_name.localeCompare(b.first_name));
  }, [emps, shifts]);

  const summary = useMemo(
    () => summarizeWeek(shifts, rows.map((r) => r.id), monday, now, rates),
    [shifts, rows, monday, now, rates],
  );

  const totals = useMemo(() => {
    const vals = Object.values(summary);
    const sum = (k: "workedMin" | "remainingMin" | "scheduledMin") => vals.reduce((a, v) => a + v[k], 0);
    return {
      worked: sum("workedMin"), remaining: sum("remainingMin"), scheduled: sum("scheduledMin"),
      pay: vals.reduce((a, v) => a + (v.payCents ?? 0), 0),
      missingRates: rows.filter((r) => summary[r.id]?.workedMin && rates[r.id] == null).length,
      overtime: rows.filter((r) => (summary[r.id]?.overtimeMin ?? 0) > 0).length,
    };
  }, [summary, rows, rates]);

  const openNew = (employee_id = rows[0]?.id ?? "", shift_date = days.includes(today) ? today : days[0], kind: ShiftKind = "scheduled") => {
    setFormError("");
    setConfirmDelete(false);
    setForm({ employee_id, kind, shift_date, start_time: "08:00", end_time: "16:00", break_minutes: 0, notes: "" });
  };
  const openEdit = (s: Shift) => {
    setFormError("");
    setConfirmDelete(false);
    setForm({
      id: s.id, employee_id: s.employee_id, kind: s.kind, shift_date: s.shift_date,
      start_time: hhmm(s.start_time), end_time: hhmm(s.end_time),
      break_minutes: s.break_minutes, notes: s.notes ?? "",
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const problem = !form.employee_id ? "Pick an employee." : validateShift(form);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    setFormError("");
    const record = {
      employee_id: form.employee_id, kind: form.kind, shift_date: form.shift_date,
      start_time: form.start_time, end_time: form.end_time,
      break_minutes: form.break_minutes || 0, notes: form.notes.trim() || null,
    };
    const { error: err } = form.id
      ? await sb.from("employee_shifts").update(record).eq("id", form.id)
      : await sb.from("employee_shifts").insert({ ...record, created_by: employee?.id ?? null });
    setSaving(false);
    if (err) {
      setFormError(err.message.includes("row-level security") ? "Only the owner or a manager can change schedules." : err.message);
      return;
    }
    setForm(null);
    await load();
  };

  const remove = async () => {
    if (!form?.id) return;
    setSaving(true);
    const { error: err } = await sb.from("employee_shifts").delete().eq("id", form.id);
    setSaving(false);
    if (err) { setFormError(err.message); return; }
    setForm(null);
    await load();
  };

  // Turn a scheduled shift into a worked entry with the same times, to adjust and save.
  const logAsWorked = () => {
    if (!form) return;
    setConfirmDelete(false);
    setForm({ ...form, id: undefined, kind: "worked", notes: "" });
  };

  const copyLastWeek = async () => {
    setCopying(true);
    setError("");
    const prevMon = addDays(monday, -7);
    const { data, error: err } = await sb.from("employee_shifts")
      .select("employee_id, shift_date, start_time, end_time, break_minutes, notes")
      .eq("kind", "scheduled").gte("shift_date", prevMon).lte("shift_date", addDays(prevMon, 6));
    if (err) { setError(err.message); setCopying(false); return; }
    const have = new Set(shifts.filter((s) => s.kind === "scheduled")
      .map((s) => `${s.employee_id}|${s.shift_date}|${hhmm(s.start_time)}`));
    const add = (data ?? [])
      .map((s: any) => ({ ...s, shift_date: addDays(s.shift_date, 7), kind: "scheduled", created_by: employee?.id ?? null }))
      .filter((s: any) => !have.has(`${s.employee_id}|${s.shift_date}|${hhmm(s.start_time)}`));
    if (!add.length) {
      setError((data ?? []).length ? "Last week's shifts are already on this week." : "No scheduled shifts last week to copy.");
    } else {
      const { error: insErr } = await sb.from("employee_shifts").insert(add);
      if (insErr) setError(insErr.message);
    }
    setCopying(false);
    await load();
  };

  const saveRate = async () => {
    if (!rateEdit) return;
    const raw = rateEdit.value.trim().replace(/^\$/, "");
    const { id } = rateEdit;
    setRateEdit(null);
    if (raw === "") {
      await sb.from("employee_pay_rates").delete().eq("employee_id", id);
    } else {
      const cents = Math.round(parseFloat(raw) * 100);
      if (!Number.isFinite(cents) || cents < 0) { setError("Enter an hourly rate like 15 or 17.50."); return; }
      const { error: err } = await sb.from("employee_pay_rates")
        .upsert({ employee_id: id, hourly_rate_cents: cents, updated_by: employee?.id ?? null, updated_at: new Date().toISOString() });
      if (err) { setError(err.message); return; }
    }
    await load();
  };

  const weekLabel = `${formatDateShort(monday)} – ${formatDateShort(sunday)}, ${sunday.slice(0, 4)}`;
  const isThisWeek = monday === weekStart(today);
  const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#FCC300]";
  const name = (id: string) => {
    const e = emps.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : "Employee";
  };

  const chip = (s: Shift) => {
    const worked = s.kind === "worked";
    return (
      <button key={s.id} type="button" onClick={isAdmin ? () => openEdit(s) : undefined}
        title={`${worked ? "Worked" : "Scheduled"} ${formatTime12h(s.start_time)} – ${formatTime12h(s.end_time)}${s.break_minutes ? ` (${s.break_minutes}m break)` : ""}${s.notes ? ` · ${s.notes}` : ""}`}
        className={`w-full text-left rounded-lg px-2 py-1 text-[11px] leading-tight border transition-colors ${
          worked
            ? "bg-green-500/15 border-green-500/30 text-green-300 hover:bg-green-500/25"
            : "bg-[#FCC300]/8 border-[#FCC300]/35 border-dashed text-[#FCC300] hover:bg-[#FCC300]/15"
        } ${isAdmin ? "cursor-pointer" : "cursor-default"}`}>
        <div className="font-semibold whitespace-nowrap">
          {shortTime(s.start_time)}–{shortTime(s.end_time)}{isOvernight(s) ? "⁺¹" : ""}
        </div>
        <div className="opacity-75">{worked ? "Worked" : "Sched"} · {formatMinutes(shiftMinutes(s))}</div>
      </button>
    );
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">{isAdmin ? "Schedule & Hours" : "My Schedule"}</h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          {isAdmin ? "Plan shifts, log the hours people worked, and see weekly totals (Mon–Sun)." : "Your shifts and hours for the week (Mon–Sun)."}
        </p>
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyLastWeek} disabled={copying || loading}
            className="border-white/15 text-white hover:bg-white/5 text-sm">
            {copying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Copy className="w-4 h-4 mr-1.5" />}
            Copy last week
          </Button>
          <Button onClick={() => openNew()} disabled={!rows.length}
            className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
            <Plus className="w-4 h-4 mr-1.5" /> Add shift
          </Button>
        </div>
      )}
    </div>
  );

  const weekNav = (
    <div className="flex items-center gap-2">
      <button onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week"
        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="text-white font-semibold min-w-[170px] text-center">{weekLabel}</div>
      <button onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week"
        className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white">
        <ChevronRight className="w-4 h-4" />
      </button>
      {!isThisWeek && (
        <button onClick={() => setMonday(weekStart(today))}
          className="ml-1 text-xs text-[#FCC300] hover:underline">This week</button>
      )}
    </div>
  );

  const errorBox = error && (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-sm">{error}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="glass rounded-2xl p-16 flex justify-center">
          <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" />
        </div>
      </div>
    );
  }

  // ─── Employee view: own shifts only ──────────────────────────────────────────
  if (!isAdmin) {
    const mine = summarizeHours(shifts, now, null);
    return (
      <div className="space-y-6">
        {header}
        {weekNav}
        {errorBox}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Worked" value={formatMinutes(mine.workedMin)} icon={Clock} accent />
          <StatCard label="Still to work" value={formatMinutes(mine.remainingMin)} icon={Hourglass} />
          <StatCard label="Scheduled" value={formatMinutes(mine.scheduledMin)} icon={CalendarClock} />
        </div>
        <div className="glass rounded-2xl divide-y divide-white/8">
          {days.map((d) => {
            const list = shifts.filter((s) => s.shift_date === d);
            return (
              <div key={d} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4 ${d === today ? "bg-[#FCC300]/5" : ""}`}>
                <div className="sm:w-48 text-sm">
                  <span className={d === today ? "text-[#FCC300] font-semibold" : "text-white font-medium"}>{formatDateLong(d).split(",").slice(0, 2).join(",")}</span>
                  {d === today && <span className="ml-2 text-[10px] uppercase tracking-wide text-[#FCC300]">Today</span>}
                </div>
                <div className="flex-1 flex flex-wrap gap-2">
                  {list.length ? list.map((s) => (
                    <div key={s.id} className={`rounded-lg px-3 py-1.5 text-sm border ${s.kind === "worked" ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-[#FCC300]/8 border-dashed border-[#FCC300]/35 text-[#FCC300]"}`}>
                      {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}{isOvernight(s) ? " (next day)" : ""}
                      <span className="opacity-70"> · {s.kind === "worked" ? "worked" : "scheduled"} {formatMinutes(shiftMinutes(s))}</span>
                      {s.notes && <div className="text-xs opacity-70">{s.notes}</div>}
                    </div>
                  )) : <span className="text-[#A1A1AA] text-sm">Off</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Owner / manager view ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {header}
      {errorBox}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Hours worked" value={formatMinutes(totals.worked)} icon={Clock} accent
          sub={totals.overtime ? `${totals.overtime} in overtime` : undefined} />
        <StatCard label="Still to work" value={formatMinutes(totals.remaining)} icon={Hourglass} sub="Scheduled, not yet happened" />
        <StatCard label="Scheduled" value={formatMinutes(totals.scheduled)} icon={CalendarClock} sub="All planned shifts this week" />
        {showPay && (
          <StatCard label="Est. pay (worked)" value={formatCents(totals.pay)} icon={DollarSign}
            sub={totals.missingRates ? `${totals.missingRates} without a rate` : "Incl. 1.5× over 40h"} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {weekNav}
        <div className="flex items-center gap-4 text-xs text-[#A1A1AA]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-dashed border-[#FCC300]/60 bg-[#FCC300]/10" />Scheduled</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-green-500/40 bg-green-500/20" />Worked</span>
        </div>
      </div>

      {/* Week grid */}
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-white/8">
              <th className="text-left text-[#A1A1AA] font-medium px-4 py-3 w-44">Employee</th>
              {days.map((d) => (
                <th key={d} className={`text-left font-medium px-2 py-3 ${d === today ? "text-[#FCC300]" : "text-[#A1A1AA]"}`}>
                  {dayName(d)} <span className="font-normal">{formatDateShort(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/5 align-top">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">{r.first_name} {r.last_name}</div>
                  <div className="text-[#A1A1AA] text-xs">{ROLE_LABEL[r.role] ?? r.role}{r.is_active ? "" : " · inactive"}</div>
                </td>
                {days.map((d) => (
                  <td key={d} className={`px-1.5 py-2 group ${d === today ? "bg-[#FCC300]/4" : ""}`}>
                    <div className="space-y-1 min-h-[44px]">
                      {shifts.filter((s) => s.employee_id === r.id && s.shift_date === d).map(chip)}
                      <button type="button" onClick={() => openNew(r.id, d, d < today ? "worked" : "scheduled")}
                        aria-label={`Add shift for ${r.first_name} on ${formatDateShort(d)}`}
                        className="w-full rounded-lg py-1 text-[#A1A1AA]/0 group-hover:text-[#A1A1AA] hover:!text-[#FCC300] hover:bg-white/5 flex justify-center transition-colors focus:text-[#A1A1AA]">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#A1A1AA]">No active employees.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Weekly totals */}
      <div className="glass rounded-2xl overflow-x-auto">
        <div className="px-5 pt-5 pb-2 flex items-center gap-2">
          <Timer className="w-4 h-4 text-[#FCC300]" />
          <h2 className="text-white font-semibold">Hours this week</h2>
        </div>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/8 text-[#A1A1AA]">
              <th className="text-left font-medium px-5 py-2.5">Employee</th>
              <th className="text-right font-medium px-3 py-2.5">Worked</th>
              <th className="text-right font-medium px-3 py-2.5">Still to work</th>
              <th className="text-right font-medium px-3 py-2.5">Projected</th>
              <th className="text-right font-medium px-3 py-2.5">Scheduled</th>
              <th className="text-right font-medium px-3 py-2.5">Overtime</th>
              {showPay && <th className="text-right font-medium px-3 py-2.5">Rate</th>}
              {showPay && <th className="text-right font-medium px-5 py-2.5">Est. pay</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = summary[r.id];
              if (!s) return null;
              return (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="px-5 py-2.5 text-white">{r.first_name} {r.last_name}</td>
                  <td className="px-3 py-2.5 text-right text-white font-semibold">{formatMinutes(s.workedMin)}</td>
                  <td className="px-3 py-2.5 text-right text-white">{formatMinutes(s.remainingMin)}</td>
                  <td className="px-3 py-2.5 text-right text-[#A1A1AA]">{formatMinutes(s.projectedMin)}</td>
                  <td className="px-3 py-2.5 text-right text-[#A1A1AA]">{formatMinutes(s.scheduledMin)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.overtimeMin > 0
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">{formatMinutes(s.overtimeMin)}</span>
                      : s.projectedOvertimeMin > 0
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400" title="Worked + still to work goes over 40h">On track +{formatMinutes(s.projectedOvertimeMin)}</span>
                      : <span className="text-[#A1A1AA]">—</span>}
                  </td>
                  {showPay && (
                    <td className="px-3 py-2.5 text-right">
                      {rateEdit?.id === r.id ? (
                        <input autoFocus value={rateEdit.value} inputMode="decimal" aria-label={`Hourly rate for ${r.first_name}`}
                          onChange={(e) => setRateEdit({ id: r.id, value: e.target.value })}
                          onBlur={saveRate}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRate(); if (e.key === "Escape") setRateEdit(null); }}
                          placeholder="17.50"
                          className="w-20 bg-white/5 border border-[#FCC300] rounded-lg px-2 py-1 text-right text-white text-sm focus:outline-none" />
                      ) : (
                        <button onClick={() => setRateEdit({ id: r.id, value: rates[r.id] != null ? (rates[r.id] / 100).toFixed(2) : "" })}
                          className="text-[#A1A1AA] hover:text-[#FCC300] underline decoration-dotted underline-offset-4">
                          {rates[r.id] != null ? `${formatCents(rates[r.id])}/h` : "Set rate"}
                        </button>
                      )}
                    </td>
                  )}
                  {showPay && (
                    <td className="px-5 py-2.5 text-right text-white">{s.payCents == null ? "—" : formatCents(s.payCents)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-[#A1A1AA] text-xs">
          Still to work = scheduled time that hasn&apos;t happened yet. Overtime is worked time past 40h in the Mon–Sun week{showPay ? ", estimated at 1.5× the hourly rate" : ""}. Pay is an estimate before taxes.
        </p>
      </div>

      {/* Add / edit shift */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="relative w-full max-w-md glass rounded-2xl p-7 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">
                {form.id ? "Edit" : "Add"} {form.kind === "worked" ? "hours worked" : "scheduled shift"}
              </h2>
              <button onClick={() => setForm(null)} className="text-[#A1A1AA] hover:text-white" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-xl">
                {(["scheduled", "worked"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${form.kind === k
                      ? k === "worked" ? "bg-green-500/20 text-green-300" : "bg-[#FCC300] text-[#0A0A0A]"
                      : "text-[#A1A1AA] hover:text-white"}`}>
                    {k === "worked" ? "Hours worked" : "Scheduled"}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Employee *</Label>
                <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#FCC300]">
                  {rows.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#171717]">{r.first_name} {r.last_name} ({ROLE_LABEL[r.role] ?? r.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Date *</Label>
                <Input type="date" required value={form.shift_date}
                  onChange={(e) => setForm({ ...form, shift_date: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Start *</Label>
                  <Input type="time" required value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">End *</Label>
                  <Input type="time" required value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Unpaid break (minutes)</Label>
                <Input type="number" min={0} step={5} value={form.break_minutes}
                  onChange={(e) => setForm({ ...form, break_minutes: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                  className={inputCls} />
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={form.kind === "worked" ? "Stayed late for ATL delay…" : "ATL runs, office…"} className={inputCls} />
              </div>

              {form.start_time && form.end_time && form.start_time !== form.end_time && (
                <p className="text-[#A1A1AA] text-xs">
                  {formatMinutes(shiftMinutes(form))} paid
                  {isOvernight(form) ? ` · ends next day (${formatDateShort(addDays(form.shift_date, 1))})` : ""}
                  {" · "}{name(form.employee_id)}
                </p>
              )}

              {formError && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{formError}</p>}

              <Button type="submit" disabled={saving}
                className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-11 rounded-xl disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : form.id ? "Save changes" : form.kind === "worked" ? "Log hours" : "Add shift"}
              </Button>
            </form>

            {form.id && (
              <div className="mt-5 pt-5 border-t border-white/10 flex items-center justify-between gap-3">
                {form.kind === "scheduled" ? (
                  <button type="button" onClick={logAsWorked}
                    className="flex items-center gap-1.5 text-green-400 hover:text-green-300 text-xs font-medium">
                    <Clock className="w-3.5 h-3.5" /> Log as worked
                  </button>
                ) : <span />}
                {confirmDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-[#A1A1AA]">Delete for good?</span>
                    <button type="button" onClick={remove} disabled={saving}
                      className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold">Delete</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-[#A1A1AA] hover:text-white">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-medium">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
