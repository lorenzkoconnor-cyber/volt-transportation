"use client";

// Settings → Payments: the Square Terminals staff can send walk-in payments to.
// Pairing: name the Terminal → Volt gets a code from Square → sign in on the
// Terminal with "Use a device code" and type it → Volt saves the Terminal.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Nfc, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Notice, wideInputClass } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function devicesPost(body: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/payments/square-devices", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Square request failed.");
  return data;
}

export function SquareTerminalsCard() {
  const [data, setData] = useState<{ devices: any[]; configured: boolean; environment: string } | null>(null);
  const [name, setName] = useState("");
  const [manualId, setManualId] = useState("");
  const [pairing, setPairing] = useState<{ codeId: string; code: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/payments/square-devices");
    const d = await res.json().catch(() => ({}));
    if (res.ok) setData(d);
    else setMsg({ ok: false, text: d.error ?? "Couldn't load Terminals." });
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => { clearTimeout(t); if (poll.current) clearInterval(poll.current); };
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." }); }
    setBusy(false);
  };

  const startPairing = () => run(async () => {
    const n = name.trim();
    if (!n) throw new Error("Name the Terminal first (e.g. Front counter).");
    const r = await devicesPost({ action: "pair_start", name: n });
    setPairing({ codeId: r.codeId, code: r.code, name: n });
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const c = await devicesPost({ action: "pair_check", codeId: r.codeId, name: n });
        if (c.paired) {
          if (poll.current) clearInterval(poll.current);
          setPairing(null);
          setName("");
          setMsg({ ok: true, text: `${n} is paired. Staff can now send walk-in payments to it.` });
          load();
        }
      } catch { /* keep waiting */ }
    }, 4000);
  });

  const stopPairing = () => {
    if (poll.current) clearInterval(poll.current);
    setPairing(null);
  };

  const addManual = () => run(async () => {
    await devicesPost({ action: "add", name: name.trim(), deviceId: manualId.trim() });
    setName("");
    setManualId("");
    setMsg({ ok: true, text: "Terminal added." });
    await load();
  });

  const remove = (d: any) => run(async () => {
    await devicesPost({ action: "remove", id: d.id });
    setMsg({ ok: true, text: `${d.name} removed.` });
    await load();
  });

  return (
    <Card icon={Nfc} title="Square Terminals"
      description="Walk-in customers tap to pay on a Square Terminal. Staff pick Square at checkout and the Terminal shows the itemized cart — tickets, discounts and any cash already taken.">
      {!data ? (
        <div className="flex items-center gap-2 text-[#A1A1AA] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !data.configured ? (
        <p className="text-[#A1A1AA] text-sm">
          Square isn&apos;t connected yet, so the Terminal is <span className="text-white">simulated</span> — staff can try the
          whole flow and it &quot;pays&quot; after a few seconds. To go live, add the Square keys to the server
          (SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT, SQUARE_WEBHOOK_SIGNATURE_KEY), then pair the Terminal here.
        </p>
      ) : (
        <>
          {data.environment === "sandbox" && (
            <p className="text-yellow-400/90 text-xs bg-yellow-500/10 rounded-lg px-3 py-2">
              Square sandbox (test mode) — no real money moves. Add a Square test device ID below to try it.
            </p>
          )}

          {data.devices.length === 0 ? (
            <p className="text-[#A1A1AA] text-sm">No Terminals paired yet.</p>
          ) : (
            <div className="space-y-2">
              {data.devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-medium">{d.name}</div>
                    <div className="text-[#A1A1AA] text-xs font-mono">{d.device_id}</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(d)}
                    className="border-white/15 text-white hover:bg-white/5 text-xs">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {pairing ? (
            <div className="bg-[#FCC300]/10 border border-[#FCC300]/30 rounded-xl p-4 space-y-2">
              <p className="text-white text-sm">
                On the Terminal, choose <span className="font-semibold">Sign in → Use a device code</span> and enter:
              </p>
              <p className="text-[#FCC300] text-3xl font-mono font-bold tracking-widest">{pairing.code}</p>
              <p className="text-[#A1A1AA] text-xs flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Waiting for {pairing.name} to sign in… (the code expires in 5 minutes)
              </p>
              <Button size="sm" variant="outline" onClick={stopPairing} className="border-white/15 text-white hover:bg-white/5 text-xs">
                Stop
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Terminal name, e.g. Front counter"
                maxLength={60} className={wideInputClass} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={startPairing} className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Pair a Terminal
                </Button>
              </div>
              <details className="text-[#A1A1AA] text-xs">
                <summary className="cursor-pointer hover:text-white">Add by device ID instead</summary>
                <div className="flex gap-2 mt-2">
                  <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Device ID"
                    className={wideInputClass} />
                  <Button disabled={busy || !manualId.trim()} onClick={addManual} variant="outline"
                    className="border-white/15 text-white hover:bg-white/5">Add</Button>
                </div>
              </details>
            </div>
          )}
        </>
      )}
      <Notice msg={msg} />
    </Card>
  );
}
