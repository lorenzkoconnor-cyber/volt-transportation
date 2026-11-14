"use client";

// ─── One driver run, on the driver's phone ────────────────────────────────────
// One big button for the next step; everything else is glanceable. Used for
// real runs (taps go to the offline-safe queue) and practice runs (taps stay
// on the phone). See src/lib/driver-run.ts for the rules.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, Phone, MessageSquare, MapPin, Plane, Clock, AlertTriangle, Undo2,
  ChevronDown, ChevronUp, UserX, Navigation, Home, ClipboardCheck, Loader2, Send,
} from "lucide-react";
import {
  CHECK_ITEMS, DRIVER_QUICK_REPLIES, FUEL_LEVELS, MESSAGE_MAX, clockLabel, unansweredMessages, deriveRun, estimatePosition, terminalShort, to12h,
  type DerivedRun, type RunRider, type Stop,
} from "@/lib/driver-run";
import type { ActionInput, OpsSettings, RunPayload } from "@/lib/driver-runs-server";
import VanProgressBar from "@/components/driver/VanProgressBar";

export interface RunScreenProps {
  run: RunPayload;
  settings: OpsSettings;
  now: number;
  practice?: boolean;
  onBack: () => void;
  /** Big steps get a few seconds to undo before they're sent. */
  onAction: (input: ActionInput, opts?: { undoable?: boolean; label?: string }) => void;
  /** Call through Volt, or message the rider (quick reply `template` or typed `body`). Resolves to an error, or null. */
  onContact: (reservationId: string, mode: "call" | "text", template?: string, body?: string) => Promise<string | null>;
  onCheck: (body: Record<string, unknown>) => Promise<string | null>;
  businessPhone: string;
  businessPhoneHref: string;
  onSkipAhead?: () => void; // practice only
  clockOffset?: number;     // practice only: how far the pretend clock is ahead
}

const card = "rounded-2xl bg-white/[0.04] border border-white/10";
const bigBtn = "w-full rounded-2xl bg-[#FCC300] text-black font-bold text-lg py-5 active:scale-[0.99] transition disabled:opacity-40";
const midBtn = "rounded-xl border border-white/15 text-white text-sm font-medium py-3 px-3 active:bg-white/10 disabled:opacity-40";

export default function RunScreen(p: RunScreenProps) {
  const { run, settings, now } = p;
  const d = useMemo(() => deriveRun(run.trip, run.riders, run.events, now, settings), [run, now, settings]);
  const pos = estimatePosition(d, run.trip.routeMinutes, now);
  const [checkDone, setCheckDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const needsCheck = !run.checkedToday && !checkDone && d.stage === "not_started" && !!run.vehicle;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={p.onBack} aria-label="Back to my trips"
          className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#A1A1AA] shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-white text-xl font-bold leading-tight">
            {to12h(run.trip.time)} {run.trip.kind === "from_atl" ? "ATL → Columbus" : "Columbus → ATL"}
          </h1>
          <p className="text-[#A1A1AA] text-sm">
            {run.vehicle ? `${run.vehicle.name} · ${run.vehicle.plate}` : "No van assigned"} · {run.riders.reduce((s, r) => s + r.partySize, 0)} riders
          </p>
        </div>
      </div>

      {p.practice && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-blue-300 text-sm flex items-center justify-between gap-3">
          <span>Practice trip: nothing is saved or sent.</span>
          {p.onSkipAhead && d.stage !== "completed" && (
            <button onClick={p.onSkipAhead} className="text-blue-200 underline shrink-0">Skip ahead 30 min</button>
          )}
        </div>
      )}

      <Progress d={d} pos={pos} clockOffset={p.clockOffset ?? 0} />

      {needsCheck ? (
        <VanCheck run={run} onSave={async (body) => {
          const err = await p.onCheck({ ...body, kind: "pre_trip" });
          if (!err) setCheckDone(true);
          return err;
        }} />
      ) : finishing ? (
        <FinishForm onCancel={() => setFinishing(false)} onDone={async (body) => {
          if (body) {
            const err = await p.onCheck({ ...body, kind: "post_trip" });
            if (err) return err;
          }
          p.onAction({ kind: "run_completed" }, { undoable: true, label: "Back at Volt" });
          setFinishing(false);
          return null;
        }} />
      ) : (
        <StageView {...p} d={d} onFinish={() => setFinishing(true)} />
      )}

      <a href={p.businessPhoneHref}
        className="flex items-center justify-center gap-2 text-[#A1A1AA] text-sm py-3">
        <Phone className="w-4 h-4" /> Call the office · {p.businessPhone}
      </a>
    </div>
  );
}

// ── Where the van is ─────────────────────────────────────────────────────────
function Progress({ d, pos, clockOffset }: { d: DerivedRun; pos: ReturnType<typeof estimatePosition>; clockOffset: number }) {
  return (
    <div className={`${card} p-4`}>
      <VanProgressBar position={pos} clockOffset={clockOffset} />
      {d.stage === "not_started" && <p className="text-[#A1A1AA] text-xs mt-1">Leave Volt by {clockLabel(d.schedule.leaveVolt)}</p>}
    </div>
  );
}

// ── The step the driver is on ────────────────────────────────────────────────
function StageView(p: RunScreenProps & { d: DerivedRun; onFinish: () => void }) {
  const { d, run } = p;
  const [otherStop, setOtherStop] = useState(false);

  if (d.stage === "completed") {
    const boarded = run.riders.filter((r) => r.boarded).reduce((s, r) => s + r.partySize, 0);
    return (
      <div className={`${card} p-6 text-center space-y-2`}>
        <Check className="w-10 h-10 text-green-400 mx-auto" />
        <p className="text-white font-semibold text-lg">Trip complete</p>
        <p className="text-[#A1A1AA] text-sm">{boarded} rider{boarded === 1 ? "" : "s"} · back at Volt {clockLabel(d.completedAt!)}</p>
      </div>
    );
  }

  const remainingOthers = d.stops.filter((s) => s.state === "upcoming" && s.terminal !== d.nextStop?.terminal);

  return (
    <>
      {d.stage === "not_started" && <SafetyNote />}

      {/* Columbus → ATL: board at Volt before leaving. */}
      {run.trip.kind === "to_atl" && d.stage === "not_started" && (
        <section className={card}>
          <Header title="Board at Volt" sub={d.noShowAllowed ? "No-shows can be marked now" : `No-show after ${to12h(run.trip.time)}`} />
          <RiderList {...p} riders={run.riders} d={d} />
        </section>
      )}

      {d.stage === "at_stop" && d.currentStop && <CurbView {...p} stop={d.currentStop} />}

      {/* Main button */}
      <div className="space-y-2">
        <button className={bigBtn} onClick={() => {
          const n = d.next;
          if (n.type === "leave_volt") p.onAction({ kind: "left_volt" }, { undoable: true, label: n.label });
          else if (n.type === "arrive") p.onAction({ kind: "arrived_stop", terminal: n.terminal }, { undoable: true, label: n.label });
          else if (n.type === "stop_done") p.onAction({ kind: "stop_done", terminal: n.terminal }, { undoable: true, label: n.label });
          else if (n.type === "drop_off") p.onAction({ kind: "stop_done", terminal: n.terminal }, { undoable: true, label: n.label });
          else if (n.type === "back_at_volt") p.onFinish();
        }}>
          {d.next.label}
        </button>
        {(d.next.type === "arrive" || d.next.type === "drop_off") && remainingOthers.length > 0 && (
          <>
            <button className="w-full text-[#A1A1AA] text-sm py-2 flex items-center justify-center gap-1" onClick={() => setOtherStop((v) => !v)}>
              Going to a different stop first? {otherStop ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {otherStop && (
              <div className="grid gap-2">
                {remainingOthers.map((s) => (
                  <button key={s.terminal} className={midBtn} onClick={() => {
                    setOtherStop(false);
                    p.onAction(
                      { kind: d.next.type === "arrive" ? "arrived_stop" : "stop_done", terminal: s.terminal },
                      { undoable: true, label: `${d.next.type === "arrive" ? "Arrived at" : "Dropped off at"} ${terminalShort(s.terminal)}` },
                    );
                  }}>
                    {d.next.type === "arrive" ? "Arrived at" : "Dropped off at"} {terminalShort(s.terminal)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* The stop list */}
      {d.stops.length > 0 && (
        <section className={card}>
          <Header title={run.trip.kind === "from_atl" ? "ATL pickups" : "ATL drop-offs"} sub={`${d.stops.length} stop${d.stops.length === 1 ? "" : "s"}`} />
          <div className="divide-y divide-white/5">
            {d.stops.map((s, i) => <StopRow key={s.terminal} stop={s} n={i + 1} kind={run.trip.kind} />)}
          </div>
        </section>
      )}
      {d.stops.length === 0 && (
        <p className="text-[#A1A1AA] text-sm text-center py-4">No riders booked on this trip.</p>
      )}
    </>
  );
}

function SafetyNote() {
  return (
    <p className="text-[#A1A1AA] text-xs flex items-center gap-2 px-1">
      <AlertTriangle className="w-4 h-4 text-[#FCC300] shrink-0" />
      Only tap while parked. Georgia law: no phone in hand while driving.
    </p>
  );
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-2">
      <span className="text-white font-semibold">{title}</span>
      {sub && <span className="text-[#A1A1AA] text-xs text-right">{sub}</span>}
    </div>
  );
}

function StopRow({ stop, n, kind }: { stop: Stop; n: number; kind: string }) {
  const count = stop.riders.reduce((s, r) => s + r.partySize, 0);
  return (
    <div className={`px-4 py-3 ${stop.state === "current" ? "bg-[#FCC300]/5" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-medium ${stop.state === "done" ? "text-[#71717A] line-through" : "text-white"}`}>
          {n}. {terminalShort(stop.terminal)}
        </span>
        <span className="text-xs text-[#A1A1AA]">
          {stop.state === "done" ? `Done ${clockLabel(stop.doneAt!)}` : stop.state === "current" ? `Here since ${clockLabel(stop.arrivedAt!)}` : `${count} rider${count === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {stop.riders.map((r) => (
          <span key={r.reservationId} className="text-xs text-[#D4D4D8]">
            {r.name} ({r.partySize}){kind === "from_atl" && <UpdateTag r={r} />}
          </span>
        ))}
      </div>
    </div>
  );
}

function UpdateTag({ r, bare = false }: { r: RunRider; bare?: boolean }) {
  const dot = bare ? "" : "· ";
  if (r.boarded) return bare ? null : <span className="ml-1 text-green-400">· boarded</span>;
  if (r.noShow) return bare ? null : <span className="ml-1 text-red-400">· no-show</span>;
  const u = r.update;
  if (!u?.status && !(u?.terminal && u.terminal !== r.bookedTerminal)) return null;
  const moved = u?.terminal && u.terminal !== r.bookedTerminal ? ` · moved to ${terminalShort(u.terminal)}` : "";
  const map: Record<string, [string, string]> = {
    outside: ["text-green-400", "outside now"],
    baggage: ["text-yellow-400", `at baggage, ~${u?.delayMinutes ?? 10} min`],
    delayed: ["text-yellow-400", `flight delayed${u?.newLandingTime ? `, lands ${to12h(u.newLandingTime)}` : ""}`],
    cant_make_it: ["text-red-400", "can't make it"],
  };
  const [cls, text] = u?.status ? map[u.status] : ["text-yellow-400", ""];
  return <span className={`${bare ? "" : "ml-1 "}${cls}`}>{text ? `${dot}${text}` : ""}{bare ? moved.replace(/^ · /, text ? " · " : "") : moved}</span>;
}

// ── At the curb ──────────────────────────────────────────────────────────────
function CurbView(p: RunScreenProps & { d: DerivedRun; stop: Stop }) {
  const { d, stop, settings } = p;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const spot = d.spotNotes[stop.terminal] ?? settings.spots[stop.terminal]?.text;
  return (
    <section className={card}>
      <div className="px-4 py-3 border-b border-white/8">
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-lg">{terminalShort(stop.terminal)}</span>
          <span className={`text-sm font-medium flex items-center gap-1 ${d.overWait ? "text-red-400" : d.noShowAllowed ? "text-yellow-400" : "text-[#A1A1AA]"}`}>
            <Clock className="w-4 h-4" /> {d.waitedMinutes} min
          </span>
        </div>
        <p className="text-[#A1A1AA] text-xs mt-1">
          Arrived {clockLabel(stop.arrivedAt!)} · riders here were texted.
          {d.overWait ? ` Over ${settings.waitMaxMinutes} min, the office has been told.` : !d.noShowAllowed ? ` No-show after ${settings.waitMinutes} min.` : ""}
        </p>
        {spot && <p className="text-[#D4D4D8] text-xs mt-2 flex gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#FCC300]" />{spot}</p>}
      </div>
      <RiderList {...p} riders={stop.riders} d={d} />
      <div className="px-4 py-3 border-t border-white/8 space-y-2">
        {noteOpen ? (
          <div className="space-y-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} autoFocus
              placeholder="South end, by the cart return"
              className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-3 text-white text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <button className={midBtn} onClick={() => setNoteOpen(false)}>Cancel</button>
              <button className={midBtn} disabled={!note.trim()} onClick={() => {
                p.onAction({ kind: "spot_note", terminal: stop.terminal, note: note.trim() });
                setNoteOpen(false); setNote("");
              }}>Save spot</button>
            </div>
            <p className="text-[#71717A] text-xs">Shows on riders&apos; tracking pages. Text riders who already left baggage claim.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button className={midBtn} onClick={() => setNoteOpen(true)}>Use a different spot</button>
            <button className={midBtn} onClick={() => p.onAction({ kind: "stop_reopened", terminal: stop.terminal }, { undoable: true, label: "Undo arrival" })}>
              Wrong terminal? Undo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function RiderList(p: RunScreenProps & { riders: RunRider[]; d: DerivedRun }) {
  return (
    <div className="divide-y divide-white/5">
      {p.riders.map((r) => <RiderRow key={r.reservationId} {...p} r={r} />)}
    </div>
  );
}

function RiderRow(p: RunScreenProps & { r: RunRider; d: DerivedRun }) {
  const { r, d } = p;
  const [menu, setMenu] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // On-screen confirm (browser pop-ups are blocked in some in-app browsers).
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  const [draft, setDraft] = useState("");
  const waiting = unansweredMessages(r).length;

  const contact = async (mode: "call" | "text", template?: string, body?: string) => {
    setBusy(true);
    const err = await p.onContact(r.reservationId, mode, template, body);
    setBusy(false);
    if (!err) { setMenu(false); setDraft(""); }
    setMsg(err ?? (mode === "call" ? "Your phone will ring. Answer to be connected (they see Volt's number)."
      : r.canText ? "Sent to their tracking page and texted from Volt's number." : "Sent to their tracking page (they haven't agreed to texts)."));
    setTimeout(() => setMsg(null), 6000);
  };

  return (
    <div className={`px-4 py-3 ${r.boarded ? "bg-green-500/5" : r.noShow ? "bg-red-500/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-semibold ${r.noShow ? "text-red-400 line-through" : r.boarded ? "text-green-400" : "text-white"}`}>
            {r.name} · {r.partySize}
          </div>
          <div className="text-xs mt-0.5"><UpdateTag r={r} bare /></div>
          {r.flight && <div className="text-[#A1A1AA] text-xs mt-0.5 flex items-center gap-1"><Plane className="w-3 h-3" />{r.flight}</div>}
          {r.doorAddress && <div className="text-[#A1A1AA] text-xs mt-0.5 flex items-center gap-1"><Home className="w-3 h-3" />{r.doorAddress}</div>}
          {r.notes && <div className="text-[#FCC300] text-xs mt-0.5">Note: {r.notes}</div>}
          {r.rideAlong && <div className="text-[#A1A1AA] text-xs mt-0.5">Ride-along</div>}
        </div>
        {r.noShow ? (
          <button className={`${midBtn} shrink-0`} onClick={() => p.onAction({ kind: "unboarded", reservationId: r.reservationId })}>Undo</button>
        ) : (
          <button
            onClick={() => p.onAction({ kind: r.boarded ? "unboarded" : "boarded", reservationId: r.reservationId })}
            className={`shrink-0 rounded-xl px-4 py-3 text-sm font-bold ${r.boarded ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white"}`}>
            {r.boarded ? <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Boarded</span> : "Board"}
          </button>
        )}
      </div>
      {!r.boarded && !r.noShow && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <button className={midBtn} disabled={busy} onClick={() => contact("call")}>
            <span className="flex items-center justify-center gap-1"><Phone className="w-4 h-4" /> Call</span>
          </button>
          <button className={`${midBtn} ${waiting ? "border-[#FCC300]/60 text-[#FCC300]" : ""}`} disabled={busy} onClick={() => setMenu((v) => !v)}>
            <span className="flex items-center justify-center gap-1"><MessageSquare className="w-4 h-4" /> {waiting ? `Reply (${waiting})` : "Message"}</span>
          </button>
          <button className={midBtn} disabled={!d.noShowAllowed} onClick={() => setConfirmNoShow(true)}>
            <span className="flex items-center justify-center gap-1"><UserX className="w-4 h-4" /> No-show</span>
          </button>
        </div>
      )}
      {!r.boarded && !r.noShow && !d.noShowAllowed && (
        <p className="text-[#71717A] text-xs mt-1.5">
          {p.run.trip.kind === "to_atl"
            ? `No-show unlocks at departure time (${to12h(p.run.trip.time)}).`
            : `No-show unlocks ${p.settings.waitMinutes} min after you tap Arrived${d.waitedMinutes !== null ? ` (${Math.max(0, p.settings.waitMinutes - d.waitedMinutes)} min to go)` : ""}.`}
        </p>
      )}
      {confirmNoShow && !r.noShow && (
        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-2">
          <p className="text-red-300 text-sm">Mark {r.name} (party of {r.partySize}) as a no-show? The office is told.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className={midBtn} onClick={() => setConfirmNoShow(false)}>Cancel</button>
            <button className="rounded-xl bg-red-500 text-white text-sm font-bold py-3"
              onClick={() => {
                setConfirmNoShow(false);
                p.onAction({ kind: "no_show", reservationId: r.reservationId, terminal: d.currentStop?.terminal ?? null });
              }}>
              Yes, no-show
            </button>
          </div>
        </div>
      )}
      {(r.messages?.length ?? 0) > 0 && !r.boarded && !r.noShow && <Thread r={r} />}
      {menu && (
        <div className="grid gap-2 mt-2">
          {(Object.entries(DRIVER_QUICK_REPLIES) as [string, string][]).map(([key, label]) => (
            <button key={key} className={`${midBtn} text-left`} disabled={busy} onClick={() => contact("text", key)}>{label}</button>
          ))}
          <div className="flex gap-2 items-end">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={MESSAGE_MAX}
              placeholder="Or type a short message (only while parked)" aria-label={`Message to ${r.name}`}
              className="flex-1 rounded-xl bg-white/5 border border-white/15 px-3 py-2.5 text-white text-sm resize-none" />
            <button className="rounded-xl bg-[#FCC300] text-black px-4 py-3 disabled:opacity-40" disabled={busy || !draft.trim()}
              onClick={() => contact("text", undefined, draft)} aria-label="Send message">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[#71717A] text-xs">
            Shows on their tracking page{r.canText ? " and is texted from Volt's number" : ". They haven't agreed to texts, so call if it's urgent"}.
          </p>
        </div>
      )}
      {msg && <p className="text-[#A1A1AA] text-xs mt-2">{msg}</p>}
    </div>
  );
}

/** The last few messages with this rider; unanswered rider messages stand out. */
function Thread({ r }: { r: RunRider }) {
  const recent = r.messages.slice(-4);
  const waiting = new Set(unansweredMessages(r).map((m) => m.id));
  const first = r.name.split(" ")[0];
  return (
    <div className="mt-2 rounded-xl bg-white/[0.03] p-2.5 space-y-1.5">
      {r.messages.length > recent.length && <p className="text-[#71717A] text-[11px]">{r.messages.length - recent.length} earlier</p>}
      {recent.map((m) => (
        <div key={m.id} className={`text-sm ${m.from === "rider" ? (waiting.has(m.id) ? "text-[#FCC300]" : "text-white") : "text-[#A1A1AA]"}`}>
          <span className="font-semibold">{m.from === "rider" ? first : m.from === "office" ? "Office" : "You"}:</span> {m.body}
          <span className="text-[#71717A] text-[11px] ml-1.5">{clockLabel(m.at)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pre-trip van check ───────────────────────────────────────────────────────
function VanCheck({ run, onSave }: { run: RunPayload; onSave: (b: Record<string, unknown>) => Promise<string | null> }) {
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [fuel, setFuel] = useState("");
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className={card}>
      <Header title={`Check ${run.vehicle?.name ?? "the van"}`} sub="Before your first trip in it today" />
      <div className="p-4 space-y-3">
        {CHECK_ITEMS.map((it) => (
          <label key={it.key} className="flex items-center gap-3 text-white text-sm py-1">
            <input type="checkbox" className="w-5 h-5 accent-[#FCC300]" checked={!!items[it.key]}
              onChange={(e) => setItems((v) => ({ ...v, [it.key]: e.target.checked }))} />
            {it.label}
          </label>
        ))}
        <div>
          <p className="text-[#A1A1AA] text-xs mb-1.5">Fuel</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FUEL_LEVELS.map((f) => (
              <button key={f} onClick={() => setFuel(f)}
                className={`rounded-lg py-2.5 text-sm ${fuel === f ? "bg-[#FCC300] text-black font-bold" : "bg-white/5 text-white"}`}>{f}</button>
            ))}
          </div>
        </div>
        <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))}
          placeholder="Odometer (miles)" className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-3 text-white text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2}
          placeholder="Anything wrong? (optional)" className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-3 text-white text-sm" />
        <p className="text-[#71717A] text-xs">Leave a box unticked if something&apos;s wrong. The office is told right away.</p>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button className={bigBtn} disabled={busy} onClick={async () => {
          if (!fuel) { setErr("Pick the fuel level."); return; }
          setBusy(true); setErr("");
          const e = await onSave({ items, fuel, mileage, notes });
          setBusy(false);
          if (e) setErr(e);
        }}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2"><ClipboardCheck className="w-5 h-5" /> Van checked</span>}
        </button>
      </div>
    </section>
  );
}

// ── Back at Volt ─────────────────────────────────────────────────────────────
function FinishForm({ onDone, onCancel }: { onDone: (b: Record<string, unknown> | null) => Promise<string | null>; onCancel: () => void }) {
  const [fuel, setFuel] = useState("");
  const [mileage, setMileage] = useState("");
  const [err, setErr] = useState("");
  return (
    <section className={card}>
      <Header title="Back at Volt" sub="Mileage and fuel help track costs" />
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-5 gap-1.5">
          {FUEL_LEVELS.map((f) => (
            <button key={f} onClick={() => setFuel(f)}
              className={`rounded-lg py-2.5 text-sm ${fuel === f ? "bg-[#FCC300] text-black font-bold" : "bg-white/5 text-white"}`}>{f}</button>
          ))}
        </div>
        <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))}
          placeholder="Odometer (miles)" className="w-full rounded-xl bg-white/5 border border-white/15 px-3 py-3 text-white text-sm" />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button className={bigBtn} onClick={async () => {
          const e = await onDone(fuel ? { fuel, mileage, items: {} } : null);
          if (e) setErr(e);
        }}>
          <span className="flex items-center justify-center gap-2"><Navigation className="w-5 h-5" /> Finish trip</span>
        </button>
        <button className="w-full text-[#A1A1AA] text-sm py-2" onClick={onCancel}>Not back yet</button>
      </div>
    </section>
  );
}

// ── Undo banner ──────────────────────────────────────────────────────────────
export function UndoBanner({ label, secondsLeft, onUndo }: { label: string; secondsLeft: number; onUndo: () => void }) {
  return (
    <div className="fixed bottom-4 inset-x-4 z-50 max-w-lg mx-auto rounded-2xl bg-[#27272A] border border-white/15 px-4 py-3 flex items-center justify-between gap-3 shadow-xl">
      <span className="text-white text-sm">{label} · sending in {secondsLeft}s</span>
      <button onClick={onUndo} className="flex items-center gap-1 text-[#FCC300] font-bold text-sm px-3 py-2">
        <Undo2 className="w-4 h-4" /> Undo
      </button>
    </div>
  );
}

export function useTicker(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
