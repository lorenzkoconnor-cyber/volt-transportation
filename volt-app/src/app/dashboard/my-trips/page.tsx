"use client";

// ─── My Trips — the driver's phone screen ─────────────────────────────────────
// Office staff pick the driver and van for each departure; the driver runs the
// trip from here: van check, "On the way", "Arrived at <terminal>", boarding,
// no-shows, "Back at Volt". Taps are queued on the phone so a dead zone can't
// lose one, and big steps get a few seconds to undo before they're sent.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ChevronRight, GraduationCap, Volume2, VolumeX, WifiOff, AlertTriangle, Clock } from "lucide-react";
import RunScreen, { UndoBanner, useTicker } from "@/components/driver/RunScreen";
import { practiceRun } from "@/components/driver/practice";
import { useRunQueue, newClientId, type QueuedTap } from "@/components/driver/run-queue";
import {
  DRIVER_QUICK_REPLIES, deriveRun, hoursLabel, terminalShort, to12h,
  type RunEvent, type RunRider,
} from "@/lib/driver-run";
import type { ActionInput, OpsSettings, RunPayload } from "@/lib/driver-runs-server";
import { phoneHref } from "@/lib/settings";

interface Loaded {
  runs: RunPayload[];
  settings: OpsSettings;
  role: string;
  me: { driverId: string; firstName: string; photoUrl: string | null; shiftStartedAt: string | null } | null;
  notLinked?: string;
}

const UNDO_SECONDS = 5;

const FALLBACK_SETTINGS: OpsSettings = {
  waitMinutes: 20, waitMaxMinutes: 25, maxShiftHours: 10, businessPhone: "(706) 530-5896",
  spots: {
    "Domestic – South": { text: "Commercial shuttle pickup (Ground Transportation), Domestic Terminal South side.", photo: null },
    "Domestic – North": { text: "Commercial shuttle pickup (Ground Transportation), Domestic Terminal North side.", photo: null },
    "International (Concourse F)": { text: "Commercial shuttle pickup, International Terminal arrivals level.", photo: null },
    "Terminal not given": { text: "Your driver will text you the exact spot.", photo: null },
  },
};

/** A run with taps that haven't reached the server yet shown on top. */
function withTaps(run: RunPayload, taps: { input: ActionInput & { at?: string } }[]): RunPayload {
  if (!taps.length) return run;
  const events: RunEvent[] = [...run.events];
  const riders: RunRider[] = run.riders.map((r) => ({ ...r }));
  for (const t of taps) {
    const at = t.input.at ?? new Date().toISOString();
    const kind = t.input.kind as RunEvent["kind"];
    events.push({ kind, terminal: t.input.terminal ?? null, reservationId: t.input.reservationId ?? null, note: t.input.note ?? null, at });
    const r = riders.find((x) => x.reservationId === t.input.reservationId);
    if (r && kind === "boarded") { r.boarded = true; r.noShow = false; }
    if (r && kind === "unboarded") { r.boarded = false; r.noShow = false; }
    if (r && kind === "no_show") { r.boarded = false; r.noShow = true; }
  }
  return { ...run, events, riders };
}

export default function MyTripsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [holding, setHolding] = useState<{ tap: QueuedTap; label: string; until: number } | null>(null);
  const [practice, setPractice] = useState<RunPayload | null>(null);
  const [practiceOffset, setPracticeOffset] = useState(0);
  const [speak, setSpeak] = useState(false);
  const [toast, setToast] = useState("");
  const now = useTicker(holding ? 1000 : 15_000);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/driver-runs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load your trips.");
      setData(json);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your trips.");
    }
  }, []);

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 6000); }, []);
  const { queue, push, offline } = useRunQueue(load, showToast);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  // Send a held (undoable) tap once its countdown runs out.
  useEffect(() => {
    if (!holding) return;
    const t = setTimeout(() => {
      push(holding.tap.tvId, holding.tap.input);
      setHolding(null);
    }, Math.max(0, holding.until - Date.now()));
    return () => clearTimeout(t);
  }, [holding, push]);

  // Read rider updates out loud (hands-free), when switched on.
  const heard = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!data) return;
    const fresh: string[] = [];
    for (const run of data.runs) {
      for (const r of run.riders) {
        const u = r.update;
        if (!u || r.boarded || r.noShow) continue;
        const key = `${run.tripVehicleId}:${r.reservationId}`;
        const prev = heard.current.get(key);
        heard.current.set(key, u.updatedAt);
        if (prev === undefined || prev === u.updatedAt) continue; // first load, or nothing new
        const first = r.name.split(" ")[0];
        if (u.status === "outside") fresh.push(`${first} is outside at ${terminalShort(r.terminal)}.`);
        else if (u.status === "baggage") fresh.push(`${first} is at baggage claim, about ${u.delayMinutes ?? 10} minutes.`);
        else if (u.status === "delayed") fresh.push(`${first}'s flight is delayed${u.newLandingTime ? `, landing ${to12h(u.newLandingTime)}` : ""}.`);
        else if (u.status === "cant_make_it") fresh.push(`${first} can't make this ride.`);
        else if (u.terminal) fresh.push(`${first} is at ${terminalShort(u.terminal)}.`);
      }
      // New rider messages, read out word for word.
      for (const r of run.riders) {
        if (r.boarded || r.noShow) continue;
        const key = `msg:${run.tripVehicleId}:${r.reservationId}`;
        const last = r.messages[r.messages.length - 1];
        const prev = heard.current.get(key);
        heard.current.set(key, last?.id ?? "");
        if (prev === undefined || !last || last.id === prev) continue;
        const first = r.name.split(" ")[0];
        const idx = r.messages.findIndex((m) => m.id === prev);
        for (const m of r.messages.slice(idx + 1)) if (m.from === "rider") fresh.push(`Message from ${first}: ${m.body}`);
      }
    }
    if (speak && fresh.length && typeof window !== "undefined" && "speechSynthesis" in window) {
      for (const line of fresh) window.speechSynthesis.speak(new SpeechSynthesisUtterance(line));
    }
  }, [data, speak]);

  const runs = useMemo(() => (data?.runs ?? []).map((run) => {
    const taps = [
      ...queue.filter((q) => q.tvId === run.tripVehicleId),
      ...(holding?.tap.tvId === run.tripVehicleId ? [holding.tap] : []),
    ];
    return withTaps(run, taps);
  }), [data, queue, holding]);

  // Practice (and the screens) still work before the first load, e.g. with no signal.
  const settings: OpsSettings = data?.settings ?? FALLBACK_SETTINGS;
  const businessPhone = settings?.businessPhone ?? "(706) 530-5896";

  // ── Practice trip ──────────────────────────────────────────────────────────
  const practiceNow = now + practiceOffset;
  const practiceAction = (input: ActionInput) => {
    setPractice((p) => p && withTaps(p, [{ input: { ...input, at: new Date(practiceNow).toISOString() } }]));
  };

  if (practice) {
    return (
      <RunScreen
        run={practice} settings={settings} now={practiceNow} practice
        onBack={() => { setPractice(null); setPracticeOffset(0); }}
        onAction={(input) => practiceAction(input)}
        onContact={async (id, mode, template, body) => {
          if (mode === "call") return "Practice: in a real trip your phone rings, then connects you to the rider from Volt's number.";
          const text = template ? DRIVER_QUICK_REPLIES[template as keyof typeof DRIVER_QUICK_REPLIES] : (body ?? "").trim();
          const msg = { id: `pm${Date.now()}`, from: "driver" as const, body: text, at: new Date(practiceNow).toISOString() };
          setPractice((p) => p && { ...p, riders: p.riders.map((r) => r.reservationId === id ? { ...r, messages: [...r.messages, msg] } : r) });
          return null;
        }}
        onCheck={async () => null}
        onSkipAhead={() => setPracticeOffset((o) => o + 30 * 60_000)}
        clockOffset={practiceOffset}
        businessPhone={businessPhone} businessPhoneHref={phoneHref(businessPhone)}
      />
    );
  }

  // ── One run ────────────────────────────────────────────────────────────────
  const current = runs.find((r) => r.tripVehicleId === selected);
  if (current) {
    return (
      <>
        <Banners offline={offline} queued={queue.length} toast={toast} />
        <RunScreen
          run={current} settings={settings} now={now}
          onBack={() => setSelected(null)}
          onAction={(input, opts) => {
            if (opts?.undoable) {
              if (holding) push(holding.tap.tvId, holding.tap.input); // a second big tap sends the first
              setHolding({
                tap: { tvId: current.tripVehicleId, input: { ...input, clientId: newClientId(), at: new Date().toISOString() } },
                label: opts.label ?? "Saved", until: Date.now() + UNDO_SECONDS * 1000,
              });
            } else push(current.tripVehicleId, input);
          }}
          onContact={async (reservationId, mode, template, body) => {
            try {
              const res = await fetch(`/api/driver-runs/${current.tripVehicleId}/contact`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reservationId, mode, template, body }),
              });
              const json = await res.json().catch(() => ({}));
              if (res.ok && mode === "text") load();
              return res.ok ? null : (json.error ?? "That didn't go through.");
            } catch { return "No signal. Try again in a moment."; }
          }}
          onCheck={async (body) => {
            try {
              const res = await fetch(`/api/driver-runs/${current.tripVehicleId}/check`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok) return json.error ?? "Couldn't save the check.";
              load();
              return null;
            } catch { return "No signal. Try again in a moment."; }
          }}
          businessPhone={businessPhone} businessPhoneHref={phoneHref(businessPhone)}
        />
        {holding && (
          <UndoBanner label={holding.label} secondsLeft={Math.max(1, Math.ceil((holding.until - now) / 1000))} onUndo={() => setHolding(null)} />
        )}
      </>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  if (!data && !error) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" /></div>;
  }

  const shiftMin = data?.me?.shiftStartedAt ? (now - new Date(data.me.shiftStartedAt).getTime()) / 60_000 : null;
  const maxMin = settings.maxShiftHours * 60;
  const isOffice = data?.role && data.role !== "driver";
  const upcoming = runs.filter((r) => !r.events.some((e) => e.kind === "run_completed"));
  const nextId = upcoming[0]?.tripVehicleId;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Banners offline={offline} queued={queue.length} toast={toast} />
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">My Trips</h1>
          <p className="text-[#A1A1AA] text-sm">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" })}
            {isOffice && " · every driver's trips today"}
          </p>
        </div>
        <button onClick={() => setSpeak((v) => !v)}
          className={`rounded-xl px-3 py-2 text-xs flex items-center gap-1.5 ${speak ? "bg-[#FCC300]/15 text-[#FCC300]" : "bg-white/5 text-[#A1A1AA]"}`}>
          {speak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Read updates aloud
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">{error}</p>}
      {data?.notLinked && <p className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-yellow-300 text-sm">{data.notLinked}</p>}

      {shiftMin !== null && shiftMin >= maxMin - 60 && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${shiftMin >= maxMin ? "bg-red-500/10 border border-red-500/30 text-red-300" : "bg-yellow-500/10 border border-yellow-500/30 text-yellow-300"}`}>
          <Clock className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            You&apos;ve been on shift {hoursLabel(shiftMin)}. Volt&apos;s limit is {settings.maxShiftHours} hours
            {shiftMin >= maxMin ? ". Talk to the office before taking another trip." : "."}
          </span>
        </div>
      )}

      {runs.length === 0 && !data?.notLinked && (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center">
          <p className="text-white font-semibold">No trips assigned to you today</p>
          <p className="text-[#A1A1AA] text-sm mt-1">The office assigns drivers and vans on the Dispatch page.</p>
        </div>
      )}

      <div className="space-y-3">
        {runs.map((run) => {
          const d = deriveRun(run.trip, run.riders, run.events, now, settings);
          const count = run.riders.reduce((s, r) => s + r.partySize, 0);
          const stage = d.stage === "completed" ? "Done" : d.stage === "not_started" ? (run.tripVehicleId === nextId ? "Next" : "Later") : "Under way";
          return (
            <button key={run.tripVehicleId} onClick={() => setSelected(run.tripVehicleId)}
              className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 ${
                run.tripVehicleId === nextId || d.stage !== "not_started" && d.stage !== "completed"
                  ? "bg-[#FCC300]/5 border-[#FCC300]/30" : "bg-white/[0.04] border-white/10"
              } ${d.stage === "completed" ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-bold text-lg">{to12h(run.trip.time)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${stage === "Under way" ? "bg-[#FCC300] text-black" : stage === "Next" ? "bg-[#FCC300]/15 text-[#FCC300]" : "bg-white/10 text-[#A1A1AA]"}`}>{stage}</span>
                </div>
                <div className="text-white text-sm">{run.trip.kind === "from_atl" ? "ATL → Columbus" : "Columbus → ATL"}</div>
                <div className="text-[#A1A1AA] text-xs mt-0.5">
                  {count} rider{count === 1 ? "" : "s"} · {d.stops.length} stop{d.stops.length === 1 ? "" : "s"} · {run.vehicle?.name ?? "no van"}
                  {isOffice && run.driver ? ` · ${run.driver.name}` : ""}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#A1A1AA] shrink-0" />
            </button>
          );
        })}
      </div>

      {(
        <button onClick={() => setPractice(practiceRun(Date.now()))}
          className="w-full rounded-2xl border border-dashed border-white/20 p-4 text-[#A1A1AA] text-sm flex items-center justify-center gap-2">
          <GraduationCap className="w-5 h-5" /> Try a practice trip (nothing is sent)
        </button>
      )}

      <p className="text-[#71717A] text-xs flex items-center gap-2 justify-center">
        <AlertTriangle className="w-3.5 h-3.5" /> Only use this screen while parked.
      </p>
    </div>
  );
}

function Banners({ offline, queued, toast }: { offline: boolean; queued: number; toast: string }) {
  return (
    <>
      {offline && (
        <div className="max-w-lg mx-auto rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-2.5 text-yellow-300 text-sm flex items-center gap-2 mb-3">
          <WifiOff className="w-4 h-4 shrink-0" />
          No signal. {queued} tap{queued === 1 ? "" : "s"} saved on your phone, sending when you have signal.
        </div>
      )}
      {toast && (
        <div className="max-w-lg mx-auto rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-red-300 text-sm mb-3">{toast}</div>
      )}
    </>
  );
}
