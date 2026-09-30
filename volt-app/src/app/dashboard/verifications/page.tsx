"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort } from "@/lib/format";
import { categoryLabel } from "@/lib/military";
import { MILITARY_DISCOUNT_PERCENT } from "@/lib/booking";
import {
  ShieldCheck, Loader2, Check, X, ExternalLink, Mail, Phone, Clock, BadgeCheck, CircleSlash, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PendingCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  military_category: string | null;
  military_submitted_at: string | null;
}

// A booking made while the rider's verification was pending.
interface HeldBooking {
  id: string;
  customer_id: string;
  confirmation_number: string;
  status: string;
  subtotal_cents: number;
  trip: { departure_date: string } | null;
  payment: { status: string; amount_cents: number; authorization_expires_at: string | null } | null;
}

// Flag holds that will expire within this many days (Stripe releases them at 7).
const EXPIRING_SOON_DAYS = 2;

const cents = (c: number) => `$${(c / 100).toFixed(2)}`;

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - Date.now()) / 86_400_000;
}

function holdLabel(b: HeldBooking): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const p = b.payment;
  if (b.status === "cancelled") return { text: "Cancelled", tone: "muted" };
  if (!p) return { text: "No payment on file", tone: "bad" };
  if (p.status === "authorized") {
    const d = daysLeft(p.authorization_expires_at);
    if (d === null) return { text: `Hold ${cents(p.amount_cents)}`, tone: "ok" };
    if (d <= 0) return { text: `Hold ${cents(p.amount_cents)} — expired`, tone: "bad" };
    const left = d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : `${Math.floor(d)}d`;
    return { text: `Hold ${cents(p.amount_cents)} — expires in ${left}`, tone: d <= EXPIRING_SOON_DAYS ? "warn" : "ok" };
  }
  if (p.status === "paid") return { text: `Charged ${cents(p.amount_cents)} — ${MILITARY_DISCOUNT_PERCENT}% refunded if approved`, tone: "muted" };
  if (p.status === "voided") return { text: "Hold expired — collect payment", tone: "bad" };
  return { text: `Payment ${p.status}`, tone: "muted" };
}

const TONE: Record<string, string> = {
  ok: "text-[#A1A1AA]",
  warn: "text-yellow-400",
  bad: "text-red-400",
  muted: "text-[#A1A1AA]/70",
};

export default function VerificationsPage() {
  const supabase = createClient();
  const sb = supabase as any;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingCustomer[]>([]);
  const [held, setHeld] = useState<HeldBooking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("customers")
      .select("id, first_name, last_name, email, phone, military_category, military_submitted_at")
      .eq("military_status", "pending")
      .order("military_submitted_at", { ascending: true });
    setRows(data ?? []);

    const ids = (data ?? []).map((c: PendingCustomer) => c.id);
    if (ids.length > 0) {
      const { data: bookings } = await sb
        .from("reservations")
        .select("id, customer_id, confirmation_number, status, subtotal_cents, trip:trips!reservations_trip_id_fkey(departure_date), payments(status, amount_cents, authorization_expires_at, created_at)")
        .in("customer_id", ids)
        .eq("military_discount_pending", true)
        .order("created_at", { ascending: true });
      setHeld((bookings ?? []).map((b: any) => ({
        ...b,
        payment: [...(b.payments ?? [])].sort((x: any, y: any) => y.created_at.localeCompare(x.created_at))[0] ?? null,
      })));
    } else {
      setHeld([]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const viewId = async (customerId: string) => {
    setViewingId(customerId);
    try {
      const res = await fetch(`/api/military/id-url?customerId=${customerId}`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open ID");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setToast({ kind: "err", msg: err instanceof Error ? err.message : "Could not open ID" });
    }
    setViewingId(null);
  };

  const review = async (customerId: string, decision: "approve" | "reject" | "unverifiable") => {
    if (decision === "unverifiable" && !window.confirm(
      "Charge the FULL fare on this rider's held bookings now? Their request stays in review — " +
      `if you approve them later, the ${MILITARY_DISCOUNT_PERCENT}% is refunded automatically.`,
    )) return;
    setBusyId(customerId);
    try {
      const res = await fetch("/api/military/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const parts: string[] = [
        decision === "approve" ? "Approved." : decision === "reject" ? "Marked as not eligible." : "Charged the full fare; request stays in review.",
      ];
      if (data.captured > 0) {
        parts.push(`Charged ${data.captured} held booking${data.captured > 1 ? "s" : ""} (${cents(data.capturedCents)}).`);
      }
      if (data.refunded > 0) {
        parts.push(`Refunded ${MILITARY_DISCOUNT_PERCENT}% on ${data.refunded} booking${data.refunded > 1 ? "s" : ""} (${cents(data.refundedCents)}).`);
      }
      if (data.released > 0) parts.push(`Released ${data.released} hold${data.released > 1 ? "s" : ""} on cancelled bookings.`);
      if (data.failed?.length > 0) parts.push(`Needs attention: ${data.failed.join(" ")}`);
      setToast({ kind: data.failed?.length > 0 ? "err" : "ok", msg: parts.join(" ") });
      if (decision === "unverifiable") load();
      else {
        setRows((prev) => prev.filter((r) => r.id !== customerId));
        setHeld((prev) => prev.filter((b) => b.customer_id !== customerId));
      }
    } catch (err) {
      setToast({ kind: "err", msg: err instanceof Error ? err.message : "Failed to record decision" });
    }
    setBusyId(null);
  };

  const expiringCount = held.filter((b) => {
    const d = b.payment?.status === "authorized" ? daysLeft(b.payment.authorization_expires_at) : null;
    return b.status !== "cancelled" && d !== null && d <= EXPIRING_SOON_DAYS;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#FCC300]" />
            Verifications
          </h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            Review Military Discount requests. Only <strong className="text-white">active-duty</strong> and{" "}
            <strong className="text-white">retired</strong> military qualify — former members who didn&apos;t
            retire and first responders do not. Bookings made while pending have a card hold for the full fare:{" "}
            <strong className="text-white">Approve</strong> charges {100 - MILITARY_DISCOUNT_PERCENT}%,{" "}
            <strong className="text-white">Reject</strong> charges 100%, and{" "}
            <strong className="text-white">Can&apos;t verify</strong> charges 100% but keeps the request open (approving later
            refunds the {MILITARY_DISCOUNT_PERCENT}%). Card holds expire after 7 days.
          </p>
        </div>
        <div className="glass rounded-xl px-4 py-2 text-center">
          <div className="text-white font-bold text-lg">{loading ? "…" : rows.length}</div>
          <div className="text-[#A1A1AA] text-xs">Pending</div>
        </div>
      </div>

      {!loading && expiringCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-yellow-500/10 border border-yellow-500/25 text-yellow-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {expiringCount} card hold{expiringCount > 1 ? "s expire" : " expires"} within {EXPIRING_SOON_DAYS} days.
            Approve or reject now — or use <strong>Can&apos;t verify</strong> to charge the full fare before the hold is lost.
          </span>
        </div>
      )}

      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          toast.kind === "ok"
            ? "bg-green-500/10 border border-green-500/20 text-green-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-16 flex justify-center">
          <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <BadgeCheck className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">No verifications waiting</p>
          <p className="text-[#A1A1AA] text-sm">New Military Discount requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{r.first_name} {r.last_name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FCC300]/15 text-[#FCC300] font-medium">
                    {categoryLabel(r.military_category)}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-[#A1A1AA] flex-wrap">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</span>
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
                    {r.military_submitted_at ? formatDateShort(r.military_submitted_at) : "—"}
                  </span>
                </div>
                {held.filter((b) => b.customer_id === r.id).length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {held.filter((b) => b.customer_id === r.id).map((b) => {
                      const label = holdLabel(b);
                      return (
                        <li key={b.id} className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="font-mono text-white">{b.confirmation_number}</span>
                          {b.trip?.departure_date && <span className="text-[#A1A1AA]">· trip {formatDateShort(b.trip.departure_date)}</span>}
                          <span className={TONE[label.tone]}>· {label.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <Button
                  variant="outline" size="sm"
                  onClick={() => viewId(r.id)}
                  disabled={viewingId === r.id}
                  className="border-white/15 text-white hover:bg-white/5"
                >
                  {viewingId === r.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><ExternalLink className="w-3.5 h-3.5 mr-1.5" />View ID</>}
                </Button>
                <Button
                  size="sm"
                  onClick={() => review(r.id, "approve")}
                  disabled={busyId === r.id}
                  className="bg-green-600 hover:bg-green-500 text-white"
                >
                  {busyId === r.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><Check className="w-3.5 h-3.5 mr-1.5" />Approve</>}
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => review(r.id, "reject")}
                  disabled={busyId === r.id}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />Reject
                </Button>
                {held.some((b) => b.customer_id === r.id && b.status !== "cancelled" && b.payment?.status === "authorized") && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => review(r.id, "unverifiable")}
                    disabled={busyId === r.id}
                    title="Charge the full fare on held bookings; keep the request open"
                    className="border-white/15 text-[#A1A1AA] hover:bg-white/5"
                  >
                    <CircleSlash className="w-3.5 h-3.5 mr-1.5" />Can&apos;t verify
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
