"use client";

// Team Portal → Ride-Along. A rider without a reservation wants a seat on a
// van that's about to leave: pick the trip, show them the QR code, and they
// pay on their own phone (/ride/<token>). Paid parties appear here live and
// on the trip manifest. Drivers and office staff can both use it.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { AlertCircle, CheckCircle2, ClipboardList, Copy, Loader2, QrCode, RefreshCw, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatTime12h } from "@/lib/format";
import type { RideAlongTrip } from "@/lib/ride-along";

interface Party { confirmationNumber: string; reservationId: string; name: string; riders: number; bags: number; pets: number }
interface Session {
  id: string;
  url: string;
  open: boolean;
  expiresAt: string;
  trip: RideAlongTrip | null;
  parties: Party[];
}

async function api(method: "GET" | "POST", query = "", body?: unknown) {
  const res = await fetch(`/api/ride-along${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

const tripLabel = (t: RideAlongTrip) => `${t.from} → ${t.to} · ${formatDateShort(t.date)}, ${formatTime12h(t.time)}`;

function RideAlongContent() {
  const params = useSearchParams();
  const presetTrip = params.get("tripId");
  const [trips, setTrips] = useState<RideAlongTrip[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const autoStarted = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  const loadTrips = useCallback(async () => {
    try {
      const data = await api("GET");
      setTrips(data.trips ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load trips.");
      setTrips([]);
    }
  }, []);

  const start = useCallback(async (tripId: string) => {
    setError("");
    setBusy(true);
    try {
      const created = await api("POST", "", { action: "create", tripId });
      setSession({ id: created.id, url: created.url, open: true, expiresAt: created.expiresAt, trip: created.trip, parties: [] });
      setQr(await QRCode.toDataURL(created.url, { width: 640, margin: 2, color: { dark: "#0A0A0A", light: "#FFFFFF" } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the ride-along.");
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("GET")
      .then((data) => { if (!cancelled) setTrips(data.trips ?? []); })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : "Could not load trips."); setTrips([]); } });
    return () => { cancelled = true; };
  }, []);

  // Opened from a trip's manifest: go straight to its QR.
  useEffect(() => {
    if (presetTrip && !autoStarted.current) {
      autoStarted.current = true;
      start(presetTrip);
    }
  }, [presetTrip, start]);

  // While the QR is up, refresh who has paid.
  useEffect(() => {
    if (!session?.open) return;
    const timer = setInterval(async () => {
      try {
        const s = await api("GET", `?id=${session.id}`);
        setSession(s);
        setNow(Date.now());
      } catch { /* keep the last state */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [session?.id, session?.open]);

  const close = async () => {
    if (session) await api("POST", "", { action: "close", id: session.id }).catch(() => null);
    setSession(null);
    setQr("");
    loadTrips();
  };

  const copy = () => {
    if (!session) return;
    navigator.clipboard?.writeText(session.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => null);
  };

  if (session) {
    const minutesLeft = Math.max(0, Math.round((new Date(session.expiresAt).getTime() - now) / 60_000));
    return (
      <div className="space-y-5 max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Ride-Along</h1>
            {session.trip && <p className="text-[#A1A1AA] text-sm mt-0.5">{tripLabel(session.trip)}</p>}
          </div>
          <Button type="button" variant="outline" onClick={close} className="border-white/15 text-white hover:bg-white/5">
            <X className="w-4 h-4 mr-1" /> Done
          </Button>
        </div>

        {session.open ? (
          <div className="glass rounded-2xl p-6 text-center space-y-4">
            <p className="text-white font-semibold text-lg">Have the rider scan this with their phone camera</p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Ride-along QR code" className="mx-auto w-full max-w-[320px] rounded-xl bg-white p-2" />
            ) : (
              <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin mx-auto" />
            )}
            <p className="text-[#A1A1AA] text-sm">
              They choose riders and bags, then pay by card, Apple Pay or Google Pay. Open for {minutesLeft} more minute{minutesLeft === 1 ? "" : "s"}.
            </p>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[#FCC300] hover:text-[#FFD54A] text-sm">
              <Copy className="w-3.5 h-3.5" />{copied ? "Link copied" : "Copy link (to text it instead)"}
            </button>
          </div>
        ) : (
          <div className="glass rounded-2xl p-6 text-center space-y-3">
            <p className="text-white">This QR code has closed.</p>
            {session.trip && (
              <Button type="button" onClick={() => start(session.trip!.id)} disabled={busy}
                className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" /> New QR for this trip
              </Button>
            )}
          </div>
        )}

        <div className="glass rounded-2xl p-6 space-y-3">
          <h2 className="text-white font-semibold">Paid</h2>
          {session.parties.length === 0 ? (
            <p className="text-[#A1A1AA] text-sm flex items-center gap-2">
              {session.open && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Waiting for the rider to pay…
            </p>
          ) : (
            session.parties.map((p) => (
              <div key={p.confirmationNumber} className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="text-white font-medium">{p.name}</div>
                    <div className="text-[#A1A1AA] text-xs">
                      {p.riders} rider{p.riders === 1 ? "" : "s"}
                      {p.bags ? ` · ${p.bags} extra bag${p.bags === 1 ? "" : "s"}` : ""}
                      {p.pets ? ` · ${p.pets} pet${p.pets === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                </div>
                <span className="text-[#FCC300] font-mono text-sm">{p.confirmationNumber}</span>
              </div>
            ))
          )}
          {session.trip && (
            <Link href={`/dashboard/manifest?tripId=${session.trip.id}`} className="inline-flex items-center gap-1.5 text-[#A1A1AA] hover:text-white text-sm">
              <ClipboardList className="w-3.5 h-3.5" /> Open the trip manifest
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Ride-Along</h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          Someone without a reservation wants a seat? Pick the van, show them the QR code, and they pay on their phone.
        </p>
      </div>
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {trips === null || (busy && !session) ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : trips.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-[#A1A1AA] text-sm">No vans are departing in the next 12 hours.</div>
      ) : (
        <div className="space-y-2">
          {trips.map((t) => (
            <button key={t.id} type="button" disabled={busy || t.seatsLeft === 0} onClick={() => start(t.id)}
              className="w-full glass rounded-xl px-4 py-4 flex items-center justify-between gap-3 text-left hover:border-[#FCC300]/40 transition-colors disabled:opacity-50">
              <div>
                <div className="text-white font-medium">{t.from} → {t.to}</div>
                <div className="text-[#A1A1AA] text-sm">{formatDateShort(t.date)}, {formatTime12h(t.time)}{t.status === "boarding" ? " · boarding" : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#A1A1AA] text-xs flex items-center gap-1"><Users className="w-3.5 h-3.5" />{t.seatsLeft} left</span>
                <QrCode className="w-5 h-5 text-[#FCC300]" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RideAlongDashboardPage() {
  return (
    <Suspense>
      <RideAlongContent />
    </Suspense>
  );
}
