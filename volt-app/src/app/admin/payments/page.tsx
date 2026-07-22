"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCents } from "@/lib/format";
import {
  CreditCard, Banknote, RotateCcw, Search, TrendingUp, Gift,
  Loader2, AlertCircle, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/admin/StatCard";

const METHOD_STYLES: Record<string, string> = {
  stripe:  "bg-blue-500/15 text-blue-400",
  cash:    "bg-green-500/15 text-green-400",
  comp:    "bg-[#A1A1AA]/15 text-[#A1A1AA]",
};
const STATUS_STYLES: Record<string, string> = {
  paid:     "bg-green-500/15 text-green-400",
  pending:  "bg-yellow-500/15 text-yellow-400",
  refunded: "bg-orange-500/15 text-orange-400",
  failed:   "bg-red-500/15 text-red-400",
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function PaymentsPage() {
  const supabase = createClient();
  const sb = supabase as any;

  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState("");

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("payments")
      .select(
        "*, reservation:reservations(confirmation_number, customer:customers(first_name, last_name))"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    setPayments(data ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = payments.filter((p) => {
    if (!query) return true;
    const name = p.reservation?.customer
      ? `${p.reservation.customer.first_name} ${p.reservation.customer.last_name}`.toLowerCase()
      : "";
    return (
      name.includes(query.toLowerCase()) ||
      (p.reservation?.confirmation_number ?? "").toLowerCase().includes(query.toLowerCase())
    );
  });

  const paidCents    = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const refundCents  = payments.reduce((s, p) => s + p.refund_amount_cents, 0);
  const stripeCents  = payments.filter(p => p.method === "stripe" && p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const cashCents    = payments.filter(p => p.method === "cash" && p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);

  const openRefund = (p: any) => {
    setRefundTarget(p);
    setRefundAmount(((p.amount_cents - p.refund_amount_cents) / 100).toFixed(2));
    setRefundError("");
  };

  const issueRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setRefundBusy(true);
    setRefundError("");

    const cents = Math.round(parseFloat(refundAmount || "0") * 100);
    const res = await fetch("/api/payments/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: refundTarget.id, amountCents: cents }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRefundError(data.error ?? "Refund failed");
    } else {
      setRefundTarget(null);
      await load();
    }
    setRefundBusy(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">Transaction history and refund management</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Collected"  value={loading ? "…" : formatCents(paidCents)} icon={TrendingUp} accent />
        <StatCard label="Card Payments"    value={loading ? "…" : formatCents(stripeCents)} icon={CreditCard} />
        <StatCard label="Cash Payments"    value={loading ? "…" : formatCents(cashCents)} icon={Banknote} />
        <StatCard label="Refunds Issued"   value={loading ? "…" : formatCents(refundCents)} icon={RotateCcw} />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-white font-semibold">Transactions</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
              className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-9 rounded-lg text-sm focus:border-[#7C3AED]" />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/6 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
          <div className="col-span-3">Passenger</div>
          <div className="col-span-2">Confirmation</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2 text-center">Method</div>
          <div className="col-span-1 text-right">Amount</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Search className="w-8 h-8 text-[#A1A1AA]" />
            <p className="text-[#A1A1AA] text-sm">
              {payments.length === 0 ? "Payments appear here as bookings come in." : "No matching transactions."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((p) => {
              const name = p.reservation?.customer
                ? `${p.reservation.customer.first_name} ${p.reservation.customer.last_name}`
                : "—";
              const canRefund = p.status === "paid" && p.amount_cents > p.refund_amount_cents;
              return (
                <div key={p.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
                  <div className="col-span-3 text-white text-sm">{name}</div>
                  <div className="col-span-2">
                    <span className="text-[#7C3AED] text-xs font-mono">{p.reservation?.confirmation_number ?? "—"}</span>
                  </div>
                  <div className="col-span-2 text-[#A1A1AA] text-xs">
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${METHOD_STYLES[p.method] ?? ""}`}>
                      {p.method === "stripe" ? <CreditCard className="w-3 h-3" /> : p.method === "comp" ? <Gift className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                      {p.method === "stripe" ? "card" : p.method}
                    </span>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-white font-semibold text-sm">{formatCents(p.amount_cents)}</span>
                    {p.refund_amount_cents > 0 && (
                      <div className="text-orange-400 text-xs">−{formatCents(p.refund_amount_cents)}</div>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[p.status] ?? ""}`}>{p.status}</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {canRefund && (
                      <button onClick={() => openRefund(p)} className="text-[#A1A1AA] hover:text-orange-400 text-xs transition-colors">
                        Refund
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRefundTarget(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Issue Refund</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">
                  {refundTarget.reservation?.confirmation_number} · {formatCents(refundTarget.amount_cents)} {refundTarget.method === "stripe" ? "card" : refundTarget.method} payment
                </p>
              </div>
              <button onClick={() => setRefundTarget(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={issueRefund} className="space-y-4">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Refund Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={((refundTarget.amount_cents - refundTarget.refund_amount_cents) / 100).toFixed(2)}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#7C3AED]"
                />
              </div>
              {refundTarget.method === "stripe" ? (
                <p className="text-[#A1A1AA] text-xs">
                  The card will be refunded through Stripe. It usually appears on the customer&apos;s statement within 5–10 business days.
                </p>
              ) : (
                <p className="text-[#A1A1AA] text-xs">
                  This was a {refundTarget.method} payment — hand the refund to the customer directly. This records it in the books.
                </p>
              )}
              {(() => {
                const cents = Math.round(parseFloat(refundAmount || "0") * 100);
                const isFull = cents >= (refundTarget.amount_cents - refundTarget.refund_amount_cents);
                return isFull ? (
                  <p className="text-yellow-400/90 text-xs bg-yellow-500/10 rounded-lg px-3 py-2">
                    This is a full refund — it will <span className="font-semibold">cancel the reservation</span> and release the seat(s) back to the trip.
                  </p>
                ) : (
                  <p className="text-[#A1A1AA] text-xs">
                    Partial refund — the reservation stays active and seats are kept.
                  </p>
                );
              })()}
              {refundError && (
                <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{refundError}</p>
              )}
              <Button type="submit" disabled={refundBusy}
                className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                {refundBusy
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                  : <><RotateCcw className="w-4 h-4 mr-2" />Issue Refund</>}
              </Button>
            </form>
          </div>
        </div>
      )}

      <p className="text-[#A1A1AA] text-xs">
        Looking for a specific booking? Open it from the{" "}
        <Link href="/admin/reservations" className="text-[#7C3AED] hover:underline">Reservations</Link> page for full details.
      </p>
    </div>
  );
}
