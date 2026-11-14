"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, MapPin, Check, Clock, Plane, Luggage, ArrowLeftRight, XCircle, Loader2, MessageSquare, Send } from "lucide-react";
import VanProgressBar from "@/components/driver/VanProgressBar";
import { MESSAGE_MAX, RIDER_STARTERS, terminalShort, to12h } from "@/lib/driver-run";
import type { TrackPayload } from "@/lib/track-server";

const card = "rounded-2xl bg-white/[0.04] border border-white/10";
const optBtn = "w-full rounded-xl border border-white/15 text-white text-sm font-medium py-3.5 px-4 text-left flex items-center gap-3 active:bg-white/10 disabled:opacity-40";

export default function TrackView({ token, initial }: { token: string; initial: TrackPayload }) {
  const [page, setPage] = useState(initial);
  const [open, setOpen] = useState<null | "baggage" | "delayed" | "terminal" | "cant">(null);
  const [landing, setLanding] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${token}`, { cache: "no-store" });
      if (res.ok) setPage(await res.json());
    } catch { /* keep the last view */ }
  }, [token]);

  useEffect(() => {
    if (!page.active || page.stage === "completed") return;
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [page.active, page.stage, refresh]);

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/track/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: json.error ?? "That didn't go through. Call Volt." });
      else { setPage(json.page ?? page); setMsg({ ok: true, text: done }); setOpen(null); }
    } catch { setMsg({ ok: false, text: "No connection. Try again, or call Volt." }); }
    setBusy(false);
  };

  const pickup = page.leg.kind === "from_atl";
  const stop = page.myStop;
  const u = page.me.update;
  const canUpdate = pickup && !page.me.boarded && !page.me.noShow && page.stage !== "completed";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[#A1A1AA] text-sm">{page.firstName ? `Hi ${page.firstName}` : "Your ride"} · {page.confirmation}</p>
        <h1 className="text-white text-2xl font-bold">{page.leg.label}</h1>
        <p className="text-[#A1A1AA] text-sm">{page.leg.when}</p>
      </div>

      {/* Driver + van */}
      {page.driver ? (
        <div className={`${card} p-4 flex items-center gap-4`}>
          {page.driver.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.driver.photoUrl} alt={`Your driver ${page.driver.firstName}`} className="w-16 h-16 rounded-full object-cover border border-white/10" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#FCC300]/15 text-[#FCC300] flex items-center justify-center text-2xl font-bold">{page.driver.firstName[0]}</div>
          )}
          <div>
            <p className="text-white font-semibold">{page.driver.firstName} is your driver</p>
            {page.vehicle && <p className="text-[#A1A1AA] text-sm">{page.vehicle.name}{page.vehicle.plate ? ` · plate ${page.vehicle.plate}` : ""}</p>}
          </div>
        </div>
      ) : (
        <div className={`${card} p-4 text-[#A1A1AA] text-sm`}>Your driver and van will show here once they&apos;re assigned.</div>
      )}

      {/* Where the van is */}
      <div className={`${card} p-4`}>
        <VanProgressBar position={page.position} showEta={!pickup || !stop} />
        {page.stage === "not_started" && (
          <p className="text-[#A1A1AA] text-xs mt-2">Live tracking starts when your driver heads out. You&apos;ll get a text.</p>
        )}
      </div>

      {/* Your pickup */}
      {pickup && stop && (
        <div className={`${card} p-4 space-y-3`}>
          {page.me.boarded ? (
            <p className="text-green-400 font-semibold flex items-center gap-2"><Check className="w-5 h-5" /> You&apos;re on board. Enjoy the ride!</p>
          ) : stop.state === "current" ? (
            <p className="text-green-400 font-bold text-lg">Your driver is at {stop.short} now</p>
          ) : stop.state === "done" ? (
            <p className="text-white font-semibold">Your driver has left {stop.short}. Call Volt if you missed them.</p>
          ) : (
            <div>
              <p className="text-white font-semibold">Your pickup: {stop.short}</p>
              {stop.eta && page.stage !== "not_started" && (
                <p className="text-[#FCC300] text-sm mt-0.5 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Driver expected about {stop.eta}</p>
              )}
            </div>
          )}
          {page.stopOrder.length > 1 && !page.me.boarded && (
            <p className="text-[#A1A1AA] text-sm">
              Stop {stop.number} of {stop.total}: {page.stopOrder.map((s, i) => i === stop.number - 1 ? `${s} (you)` : s).join(" → ")}
            </p>
          )}
          {!page.me.boarded && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-white text-sm flex gap-2"><MapPin className="w-4 h-4 text-[#FCC300] shrink-0 mt-0.5" />{stop.spot}</p>
              {stop.spotPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stop.spotPhoto} alt={`Pickup spot at ${stop.short}`} className="mt-3 rounded-lg w-full object-cover max-h-64" />
              )}
            </div>
          )}
          {!page.me.boarded && (
            <p className="text-[#71717A] text-xs">
              Your driver waits up to {page.wait.max} minutes after arriving at your stop. After that, the office will help you rebook.
            </p>
          )}
        </div>
      )}

      {/* Messages with the driver */}
      {(page.messages.length > 0 || (page.canMessage && page.active)) && (
        <MessageCard page={page} driverName={page.driver?.firstName ?? null}
          onSend={async (text) => {
            try {
              const res = await fetch(`/api/track/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
              const json = await res.json().catch(() => ({}));
              if (!res.ok) return json.error ?? "That didn't go through. Call Volt.";
              if (json.page) setPage(json.page);
              return null;
            } catch { return "No connection. Try again, or call Volt."; }
          }} />
      )}

      {/* Tell the driver */}
      {canUpdate && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-white font-semibold mb-1">Let your driver know</p>
          {u?.status && (
            <div className="flex items-center justify-between rounded-xl bg-[#FCC300]/10 px-3 py-2 text-[#FCC300] text-sm">
              <span>
                Sent: {u.status === "outside" ? "I'm outside" : u.status === "baggage" ? `At baggage, ~${u.delayMinutes} min`
                  : u.status === "delayed" ? `Flight delayed, lands ${u.newLandingTime ? to12h(u.newLandingTime) : ""}` : "Can't make this ride"}
              </span>
              <button className="underline" disabled={busy} onClick={() => send({ status: "clear" }, "Cleared.")}>Clear</button>
            </div>
          )}

          <button className={optBtn} disabled={busy} onClick={() => send({ status: "outside" }, "Your driver can see you're outside.")}>
            <Check className="w-5 h-5 text-green-400" /> I&apos;m outside now
          </button>

          <button className={optBtn} disabled={busy} onClick={() => setOpen(open === "baggage" ? null : "baggage")}>
            <Luggage className="w-5 h-5 text-[#FCC300]" /> Still at baggage claim
          </button>
          {open === "baggage" && (
            <div className="grid grid-cols-3 gap-2">
              {[10, 20, 30].map((m) => (
                <button key={m} className="rounded-xl bg-white/5 py-3 text-white text-sm" disabled={busy}
                  onClick={() => send({ status: "baggage", delayMinutes: m }, "Your driver knows you need a few minutes.")}>{m === 30 ? "30+ min" : `${m} min`}</button>
              ))}
            </div>
          )}

          <button className={optBtn} disabled={busy} onClick={() => setOpen(open === "delayed" ? null : "delayed")}>
            <Plane className="w-5 h-5 text-[#FCC300]" /> My flight is delayed
          </button>
          {open === "delayed" && (
            <div className="flex gap-2">
              <input type="time" value={landing} onChange={(e) => setLanding(e.target.value)} aria-label="New landing time"
                className="flex-1 rounded-xl bg-white/5 border border-white/15 px-3 py-3 text-white text-sm" />
              <button className="rounded-xl bg-[#FCC300] text-black font-semibold px-4 text-sm" disabled={busy || !landing}
                onClick={() => send({ status: "delayed", newLandingTime: landing }, "Thanks, your driver and the office have your new landing time.")}>Send</button>
            </div>
          )}

          <button className={optBtn} disabled={busy} onClick={() => setOpen(open === "terminal" ? null : "terminal")}>
            <ArrowLeftRight className="w-5 h-5 text-[#FCC300]" /> I&apos;m at a different terminal
          </button>
          {open === "terminal" && (
            <div className="grid gap-2">
              {page.terminals.filter((t) => t !== stop?.terminal).map((t) => (
                <button key={t} className="rounded-xl bg-white/5 py-3 text-white text-sm" disabled={busy}
                  onClick={() => send({ terminal: t }, `Got it. Your pickup is now ${terminalShort(t)}.`)}>{terminalShort(t)}</button>
              ))}
            </div>
          )}

          <button className={optBtn} disabled={busy} onClick={() => setOpen(open === "cant" ? null : "cant")}>
            <XCircle className="w-5 h-5 text-red-400" /> I can&apos;t make this ride
          </button>
          {open === "cant" && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-2">
              <p className="text-red-300 text-sm">Tell Volt you can&apos;t make this ride? The office will reach out about rebooking.</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-xl border border-white/15 py-3 text-white text-sm" onClick={() => setOpen(null)}>Cancel</button>
                <button className="rounded-xl bg-red-500 py-3 text-white text-sm font-semibold" disabled={busy}
                  onClick={() => send({ status: "cant_make_it" }, "The office has been told and will reach out.")}>Yes, tell Volt</button>
              </div>
            </div>
          )}
          {busy && <Loader2 className="w-5 h-5 text-[#FCC300] animate-spin mx-auto" />}
          {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
        </div>
      )}

      <a href={page.businessPhoneHref} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 py-4 text-white font-semibold">
        <Phone className="w-5 h-5" /> Call Volt · {page.businessPhone}
      </a>
    </div>
  );
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function MessageCard({ page, driverName, onSend }: {
  page: TrackPayload; driverName: string | null; onSend: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const count = page.messages.length;
  // Keep the newest message in view inside the list (without scrolling the page).
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [count]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setErr("");
    const e = await onSend(t);
    setBusy(false);
    if (e) setErr(e); else setText("");
  };

  return (
    <div className={`${card} p-4 space-y-3`}>
      <p className="text-white font-semibold flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#FCC300]" /> {driverName ? `Message ${driverName}` : "Message your driver"}
      </p>
      {count > 0 ? (
        <div ref={list} className="space-y-2 max-h-72 overflow-y-auto">
          {page.messages.map((m) => (
            <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "bg-[#FCC300] text-black" : "bg-white/10 text-white"}`}>
                <p>{m.body}</p>
                <p className={`text-[10px] mt-0.5 ${m.from === "me" ? "text-black/60" : "text-[#A1A1AA]"}`}>
                  {m.from === "me" ? "You" : m.from === "office" ? "Volt office" : driverName ?? "Driver"} · {timeLabel(m.at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[#A1A1AA] text-sm">Help your driver find you: your door number, carousel, or what you&apos;re wearing.</p>
      )}
      {page.canMessage && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {RIDER_STARTERS.map((s) => (
              <button key={s} type="button" className="rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white"
                onClick={() => { setText(s); setTimeout(() => { input.current?.focus(); input.current?.setSelectionRange(s.length, s.length); }, 0); }}>
                {s.trim()}{s.endsWith(" ") ? "…" : ""}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <textarea ref={input} value={text} rows={2} maxLength={MESSAGE_MAX} aria-label="Message to your driver"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Type a short message…"
              className="flex-1 rounded-xl bg-white/5 border border-white/15 px-3 py-2.5 text-white text-sm resize-none" />
            <button className="rounded-xl bg-[#FCC300] text-black px-4 py-3 disabled:opacity-40" disabled={busy || !text.trim()} onClick={submit} aria-label="Send">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[#71717A] text-xs flex justify-between gap-2">
            <span>Your driver reads this when parked. For anything urgent, call Volt.</span>
            <span>{text.length}/{MESSAGE_MAX}</span>
          </p>
        </>
      )}
      {err && <p className="text-red-400 text-sm">{err}</p>}
    </div>
  );
}
