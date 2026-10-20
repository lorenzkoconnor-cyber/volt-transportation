"use client";

// Walk-in card payment on the counter Square Terminal. Same handle as
// StaffCardPayment, so the parent drives it the same way:
//   validate() → error message or null (before anything is saved)
//   charge(paymentId) → sends the itemized cart to the Terminal and resolves
//                       once the customer has paid; throws if they cancel, the
//                       card is declined or the Terminal times out (safe to retry)
// The cart (tickets, discounts, cash already taken) is built on the server
// from the reservation — see src/lib/square/orders.ts.

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Nfc, X } from "lucide-react";
import type { StaffCardHandle } from "@/components/admin/StaffCardPayment";

interface Device { id: string; name: string }

const POLL_MS = 2000;
const GIVE_UP_MS = 6 * 60 * 1000; // Terminal checkouts time out after 5 minutes
const DEVICE_KEY = "volt-square-device";

async function callTerminal(body: Record<string, unknown>) {
  const res = await fetch("/api/payments/square-terminal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Square Terminal request failed.");
  return data as { status: string; paid: boolean; message?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SquareTerminalPayment({ amountCents, ref }: { amountCents: number; ref?: React.Ref<StaffCardHandle> }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "waiting" | "paid">("idle");
  const active = useRef<string | null>(null); // payment id on the Terminal right now
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/square-terminal")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) { setLoadError(d.error ?? "Couldn't load Square Terminals."); return; }
        const list: Device[] = d.devices ?? [];
        setDevices(list);
        setSimulated(!!d.simulated);
        let saved = "";
        try { saved = localStorage.getItem(DEVICE_KEY) ?? ""; } catch { /* storage blocked */ }
        setDeviceId(list.find((x) => x.id === saved)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load Square Terminals."); });
    return () => { cancelled = true; };
  }, []);

  useImperativeHandle(ref, () => ({
    validate: () => {
      if (loadError) return loadError;
      if (!devices) return "Square Terminals are still loading.";
      if (!deviceId) return "No Square Terminal is paired yet — an owner or manager can add one in Settings → Payments.";
      return null;
    },
    charge: async (paymentId: string) => {
      try { localStorage.setItem(DEVICE_KEY, deviceId); } catch { /* storage blocked */ }
      setPhase("sending");
      active.current = paymentId;
      try {
        let r = await callTerminal({ action: "start", paymentId, deviceId });
        setPhase(r.paid ? "paid" : "waiting");
        const started = Date.now();
        while (!r.paid) {
          if (r.status === "CANCELED") throw new Error(r.message ?? "The Terminal payment didn't go through.");
          if (Date.now() - started > GIVE_UP_MS) {
            await callTerminal({ action: "cancel", paymentId }).catch(() => null);
            throw new Error("The Terminal timed out waiting for a card.");
          }
          await sleep(POLL_MS);
          r = await callTerminal({ action: "status", paymentId });
        }
        setPhase("paid");
      } catch (err) {
        setPhase("idle");
        throw err;
      } finally {
        active.current = null;
        setCancelling(false);
      }
    },
  }), [devices, deviceId, loadError]);

  const cancel = async () => {
    if (!active.current) return;
    setCancelling(true);
    // The polling loop sees CANCELED and reports it.
    await callTerminal({ action: "cancel", paymentId: active.current }).catch(() => setCancelling(false));
  };

  const name = devices?.find((d) => d.id === deviceId)?.name ?? "the Terminal";

  return (
    <div className="bg-white/3 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Nfc className="w-4 h-4 text-[#FCC300]" />
        <span className="text-white text-sm font-medium">Square Terminal · ${(amountCents / 100).toFixed(2)}</span>
        <span className="ml-auto text-[#A1A1AA] text-xs">Tap, dip or swipe on the Terminal</span>
      </div>

      {loadError ? (
        <p className="text-red-400 text-xs">{loadError}</p>
      ) : !devices ? (
        <div className="flex items-center gap-2 text-[#A1A1AA] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading Terminals…</div>
      ) : devices.length === 0 ? (
        <p className="text-[#A1A1AA] text-xs">
          No Square Terminal is paired yet. An owner or manager can add one in Settings → Payments.
        </p>
      ) : phase === "idle" ? (
        <div className="space-y-1.5">
          {devices.length > 1 && (
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
              className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300]">
              {devices.map((d) => <option key={d.id} value={d.id} className="bg-[#18181B]">{d.name}</option>)}
            </select>
          )}
          <p className="text-[#A1A1AA] text-xs">
            The itemized cart is sent to <span className="text-white">{name}</span> — the customer sees each ticket and discount before paying.
            {simulated && " Square isn't configured here, so the Terminal is simulated (it \"pays\" after a few seconds)."}
          </p>
        </div>
      ) : phase === "paid" ? (
        <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle2 className="w-4 h-4" /> Paid on {name}</div>
      ) : (
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-[#FCC300] animate-spin flex-shrink-0" />
          <span className="text-white text-sm flex-1">
            {phase === "sending" ? `Sending to ${name}…` : `Waiting for the customer to tap on ${name}…`}
          </span>
          {phase === "waiting" && (
            <Button type="button" size="sm" variant="outline" disabled={cancelling} onClick={cancel}
              className="border-white/15 text-white hover:bg-white/5 text-xs">
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 mr-1" />Cancel</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
