"use client";

// ─── Offline-safe tap queue for My Trips ──────────────────────────────────────
// Every tap gets an id and the time it happened, is saved on the phone
// (localStorage), and is sent when there's signal. A dead zone on I-85 can't
// lose an "Arrived". The server ignores a tap it already has (same clientId),
// so retries are safe. Taps still waiting show on screen right away.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionInput } from "@/lib/driver-runs-server";

export interface QueuedTap {
  tvId: string;
  input: ActionInput & { clientId: string; at: string };
}

const KEY = "volt-run-queue-v1";

function read(): QueuedTap[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function write(q: QueuedTap[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* private mode — still works for this page */ }
}

export function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRunQueue(onSent: () => void, onRejected: (msg: string) => void) {
  const [queue, setQueue] = useState<QueuedTap[]>([]);
  const [offline, setOffline] = useState(false);
  const flushing = useRef(false);
  const memory = useRef<QueuedTap[]>([]);

  const save = useCallback((q: QueuedTap[]) => {
    memory.current = q;
    write(q);
    setQueue(q);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    let sentAny = false;
    try {
      while (memory.current.length) {
        const tap = memory.current[0];
        let res: Response;
        try {
          res = await fetch(`/api/driver-runs/${tap.tvId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tap.input),
          });
        } catch {
          setOffline(true);
          break; // no signal — try again later
        }
        setOffline(false);
        if (res.status >= 500) break; // server trouble — retry later
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          onRejected(data.error ?? "That tap couldn't be saved.");
        }
        sentAny = true;
        save(memory.current.slice(1));
      }
    } finally {
      flushing.current = false;
      if (sentAny) onSent();
    }
  }, [onRejected, onSent, save]);

  useEffect(() => {
    memory.current = read();
    setQueue(memory.current);
    flush();
    const retry = () => flush();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 15_000);
    return () => { window.removeEventListener("online", retry); clearInterval(timer); };
  }, [flush]);

  const push = useCallback((tvId: string, input: ActionInput) => {
    const tap: QueuedTap = { tvId, input: { ...input, clientId: newClientId(), at: new Date().toISOString() } };
    save([...memory.current, tap]);
    flush();
  }, [flush, save]);

  return { queue, push, offline, flush };
}
