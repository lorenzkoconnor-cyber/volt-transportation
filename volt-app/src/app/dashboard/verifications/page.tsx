"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort } from "@/lib/format";
import { categoryLabel } from "@/lib/military";
import {
  ShieldCheck, Loader2, Check, X, ExternalLink, Mail, Phone, Clock, BadgeCheck,
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

export default function VerificationsPage() {
  const supabase = createClient();
  const sb = supabase as any;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingCustomer[]>([]);
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

  const review = async (customerId: string, decision: "approve" | "reject") => {
    setBusyId(customerId);
    try {
      const res = await fetch("/api/military/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (decision === "approve") {
        const refundNote = data.refundedCount > 0
          ? ` Refunded 5% on ${data.refundedCount} booking${data.refundedCount > 1 ? "s" : ""} ($${(data.refundedCents / 100).toFixed(2)}).`
          : "";
        const manualNote = data.manualRefundsNeeded > 0
          ? ` ${data.manualRefundsNeeded} booking(s) need a manual refund (Stripe not configured).`
          : "";
        setToast({ kind: "ok", msg: `Approved.${refundNote}${manualNote}` });
      } else {
        setToast({ kind: "ok", msg: "Marked as not eligible." });
      }
      setRows((prev) => prev.filter((r) => r.id !== customerId));
    } catch (err) {
      setToast({ kind: "err", msg: err instanceof Error ? err.message : "Failed to record decision" });
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#7C3AED]" />
            Verifications
          </h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            Review Military &amp; First Responder discount requests. Approving refunds the 5% on any
            bookings made while pending, and applies it automatically going forward.
          </p>
        </div>
        <div className="glass rounded-xl px-4 py-2 text-center">
          <div className="text-white font-bold text-lg">{loading ? "…" : rows.length}</div>
          <div className="text-[#A1A1AA] text-xs">Pending</div>
        </div>
      </div>

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
          <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <BadgeCheck className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">No verifications waiting</p>
          <p className="text-[#A1A1AA] text-sm">New Military &amp; First Responder requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{r.first_name} {r.last_name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#7C3AED]/15 text-[#7C3AED] font-medium">
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
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
