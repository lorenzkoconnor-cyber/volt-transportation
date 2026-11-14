"use client";

// ─── Dispatch live board ──────────────────────────────────────────────────────
// Today's runs at a glance for the office: where each van probably is (the
// same smooth estimate riders see), who's boarded, and anything that needs a
// look, at the top. Office staff can also tap a driver's next step for them
// (driver forgot, or their phone died). Refreshes every 20 seconds.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, AlertTriangle, Info, Loader2, Clock, MessageSquare, Send } from "lucide-react";
import VanProgressBar from "@/components/driver/VanProgressBar";
import {
  MESSAGE_MAX, clockLabel, deriveRun, estimatePosition, hoursLabel, runIssues, terminalShort, to12h, unansweredMessages,
  type RunIssue,
} from "@/lib/driver-run";
import type { OpsSettings, RunPayload } from "@/lib/driver-runs-server";

interface Loaded { runs: RunPayload[]; settings: OpsSettings; shifts: Record<string, string | null> }

export default function LiveBoard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // On-screen confirm for office overrides (no browser pop-ups).
  const [pending, setPending] = useState<{ tvId: string; body: Record<string, unknown>; text: string } | null>(null);
  // Office reply box: which rider it's open for, and the draft.
  const [replyTo, setReplyTo] = useState<{ tvId: string; reservationId: string } | null>(null);
  const [draft, setDraft] = useState("");

  const reply = async (tvId: string, reservationId: string) => {
    setBusy(tvId);
    const res = await fetch(`/api/driver-runs/${tvId}/contact`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, mode: "text", body: draft }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "That didn't send.");
    else { setDraft(""); setReplyTo(null); }
    await load();
    setBusy(null);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/driver-runs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load the live board.");
      setData(json);
      setNow(Date.now());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the live board.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const act = (run: RunPayload, body: Record<string, unknown>, text: string) => setPending({ tvId: run.tripVehicleId, body, text });

  const send = async (run: RunPayload, body: Record<string, unknown>) => {
    setPending(null);
    setBusy(run.tripVehicleId);
    const res = await fetch(`/api/driver-runs/${run.tripVehicleId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "That didn't save.");
    await load();
    setBusy(null);
  };

  if (!data) {
    return error
      ? <p className="text-red-400 text-sm">{error}</p>
      : <div className="glass rounded-2xl p-6 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>;
  }

  const settings = data.settings;
  const rows = data.runs.map((run) => {
    const d = deriveRun(run.trip, run.riders, run.events, now, settings);
    const issues: RunIssue[] = runIssues(d, run.riders, run.trip.routeMinutes, now);
    const started = run.driver ? data.shifts[run.driver.id] : null;
    const shiftMin = started ? (now - new Date(started).getTime()) / 60_000 : 0;
    if (started && shiftMin >= settings.maxShiftHours * 60 && d.stage !== "completed") {
      issues.push({ key: "shift", level: "alert", text: `${run.driver!.name} has been on shift ${hoursLabel(shiftMin)} (limit ${settings.maxShiftHours}h)` });
    }
    if (!run.driver && d.stage !== "completed") issues.push({ key: "no_driver", level: "alert", text: "No driver assigned" });
    for (const r of run.riders) {
      const waiting = unansweredMessages(r);
      if (!waiting.length || r.boarded || r.noShow || d.stage === "completed") continue;
      const last = waiting[waiting.length - 1];
      const mins = Math.round((now - new Date(last.at).getTime()) / 60_000);
      issues.push({
        key: `msg:${r.reservationId}`, level: mins >= 5 ? "alert" : "heads_up",
        text: `${r.name.split(" ")[0]} wrote "${last.body}"${mins >= 1 ? ` (${mins} min ago, no reply yet)` : ""}`,
      });
    }
    return { run, d, issues, pos: estimatePosition(d, run.trip.routeMinutes, now) };
  });
  const active = rows.filter((r) => r.d.stage !== "completed");
  const problems = rows.flatMap((r) => r.issues.map((i) => ({ ...i, run: r.run })));

  return (
    <section className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between gap-2">
        <span className="text-white font-semibold flex items-center gap-2"><Radio className="w-4 h-4 text-[#FCC300]" /> Live board</span>
        <span className="text-[#A1A1AA] text-xs">{active.length} van{active.length === 1 ? "" : "s"} running or due today · updates every 20s</span>
      </div>
      {error && <p className="px-5 py-2 text-red-400 text-sm">{error}</p>}

      {problems.length > 0 && (
        <div className="px-5 py-3 border-b border-white/8 space-y-1.5 bg-red-500/[0.03]">
          {problems.map((p) => (
            <div key={`${p.run.tripVehicleId}:${p.key}`} className={`text-sm flex items-start gap-2 ${p.level === "alert" ? "text-red-300" : "text-yellow-300"}`}>
              {p.level === "alert" ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
              <span><span className="text-[#A1A1AA]">{to12h(p.run.trip.time)} {p.run.trip.kind === "from_atl" ? "ATL→CSG" : "CSG→ATL"}{p.run.driver ? ` · ${p.run.driver.firstName}` : ""}:</span> {p.text}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[#A1A1AA] text-sm">No vans assigned today yet.</p>
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map(({ run, d, pos }) => {
            const riders = run.riders.reduce((s, r) => s + r.partySize, 0);
            const boarded = run.riders.filter((r) => r.boarded).reduce((s, r) => s + r.partySize, 0);
            const noShow = run.riders.filter((r) => r.noShow).reduce((s, r) => s + r.partySize, 0);
            const n = d.next;
            const override =
              n.type === "leave_volt" ? { body: { kind: "left_volt" }, text: `Mark ${run.driver?.firstName ?? "the van"} as left Volt? Riders get the "on the way" text.` }
              : n.type === "arrive" ? { body: { kind: "arrived_stop", terminal: n.terminal }, text: `Mark the van as arrived at ${terminalShort(n.terminal)}? Riders there get the arrival text.` }
              : n.type === "stop_done" || n.type === "drop_off" ? { body: { kind: "stop_done", terminal: n.terminal }, text: `Mark ${terminalShort(n.terminal)} as done?` }
              : n.type === "back_at_volt" ? { body: { kind: "run_completed" }, text: "Mark this trip as back at Volt (finished)?" }
              : null;
            return (
              <div key={run.tripVehicleId} className={`px-5 py-4 ${d.stage === "completed" ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-white font-semibold">
                      {to12h(run.trip.time)} · {run.trip.kind === "from_atl" ? "ATL → Columbus" : "Columbus → ATL"}
                    </div>
                    <div className="text-[#A1A1AA] text-xs">
                      {run.driver?.name ?? "No driver"} · {run.vehicle?.name ?? "no van"} · {boarded}/{riders} boarded{noShow ? ` · ${noShow} no-show` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${d.stage === "at_stop" ? "text-[#FCC300]" : "text-white"}`}>{pos.label}</div>
                    {d.stage === "at_stop" && d.waitedMinutes !== null && (
                      <div className={`text-xs flex items-center gap-1 justify-end ${d.overWait ? "text-red-400" : "text-[#A1A1AA]"}`}><Clock className="w-3 h-3" />{d.waitedMinutes} min at curb</div>
                    )}
                  </div>
                </div>
                <div className="mt-2 max-w-xl">
                  <VanProgressBar position={pos} compact />
                  <div className="text-[#A1A1AA] text-xs mt-1">{pos.headline}{pos.estimated ? " · estimate" : ""}</div>
                </div>
                {d.stops.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {d.stops.map((s) => (
                      <span key={s.terminal} className={`text-xs px-2 py-0.5 rounded-full ${
                        s.state === "done" ? "bg-green-500/10 text-green-400" : s.state === "current" ? "bg-[#FCC300]/15 text-[#FCC300]" : "bg-white/5 text-[#A1A1AA]"
                      }`}>
                        {terminalShort(s.terminal)} · {s.riders.reduce((x, r) => x + r.partySize, 0)}
                      </span>
                    ))}
                  </div>
                )}
                {d.stage !== "completed" && run.riders.some((r) => r.messages.length && !r.boarded && !r.noShow) && (
                  <div className="mt-2 space-y-2">
                    {run.riders.filter((r) => r.messages.length && !r.boarded && !r.noShow).map((r) => {
                      const open = replyTo?.tvId === run.tripVehicleId && replyTo.reservationId === r.reservationId;
                      return (
                        <div key={r.reservationId} className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs space-y-1 max-w-xl">
                          {r.messages.slice(-3).map((m) => (
                            <div key={m.id} className={m.from === "rider" ? "text-white" : "text-[#A1A1AA]"}>
                              <span className="font-semibold">{m.from === "rider" ? r.name : m.from === "office" ? "Office" : run.driver?.firstName ?? "Driver"}:</span> {m.body}
                              <span className="text-[#71717A] ml-1.5">{clockLabel(m.at)}</span>
                            </div>
                          ))}
                          {open ? (
                            <div className="flex gap-2 pt-1">
                              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={MESSAGE_MAX} autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) reply(run.tripVehicleId, r.reservationId); }}
                                placeholder={`Reply to ${r.name.split(" ")[0]} as the office`} aria-label={`Reply to ${r.name}`}
                                className="flex-1 rounded-lg bg-white/5 border border-white/15 px-2.5 py-1.5 text-white text-xs" />
                              <button className="rounded-lg bg-[#FCC300] text-black px-2.5 disabled:opacity-40" aria-label="Send reply"
                                disabled={busy === run.tripVehicleId || !draft.trim()} onClick={() => reply(run.tripVehicleId, r.reservationId)}>
                                <Send className="w-3.5 h-3.5" />
                              </button>
                              <button className="text-[#A1A1AA] px-1" onClick={() => setReplyTo(null)}>Cancel</button>
                            </div>
                          ) : (
                            <button className="text-[#FCC300] hover:underline flex items-center gap-1"
                              onClick={() => { setReplyTo({ tvId: run.tripVehicleId, reservationId: r.reservationId }); setDraft(""); }}>
                              <MessageSquare className="w-3 h-3" /> Reply as office
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {d.stage !== "completed" && (
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    {override && (
                      <button disabled={busy === run.tripVehicleId} className="text-[#FCC300] hover:underline disabled:opacity-40"
                        onClick={() => act(run, override.body, override.text)}>
                        Do for driver: {n.label}
                      </button>
                    )}
                    {d.stage === "at_stop" && d.currentStop && (
                      <button disabled={busy === run.tripVehicleId} className="text-[#A1A1AA] hover:underline"
                        onClick={() => act(run, { kind: "stop_reopened", terminal: d.currentStop!.terminal }, "Undo the arrival at this terminal?")}>
                        Undo arrival
                      </button>
                    )}
                    <Link href={`/dashboard/manifest?tripId=${run.trip.id}`} className="text-[#A1A1AA] hover:underline">Boarding list</Link>
                  </div>
                )}
                {pending?.tvId === run.tripVehicleId && (
                  <div className="mt-2 rounded-xl border border-[#FCC300]/30 bg-[#FCC300]/5 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-white text-sm">{pending.text}</span>
                    <span className="flex gap-2">
                      <button className="text-[#A1A1AA] text-xs px-3 py-1.5 rounded-lg border border-white/15" onClick={() => setPending(null)}>Cancel</button>
                      <button className="text-black text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#FCC300]" onClick={() => send(run, pending.body)}>Yes, do it</button>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
