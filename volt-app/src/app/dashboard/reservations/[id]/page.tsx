"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { canViewFinancials } from "@/lib/permissions";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h, formatCents, formatDateLong } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, XCircle,
  Phone, Mail, Users, Calendar, Clock, MapPin, CreditCard, Banknote, Gift, FileText,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-500/15 text-green-400",
  pending:   "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-[#7C3AED]/15 text-[#7C3AED]",
  no_show:   "bg-orange-500/15 text-orange-400",
};

const PAY_ICONS = { stripe: CreditCard, cash: Banknote, comp: Gift } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const showMoney = canViewFinancials(useDashboardRole());
  const supabase = createClient();
  const sb = supabase as any;

  const [resv, setResv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("reservations")
      .select(
        "*, " +
        "customer:customers(id, first_name, last_name, phone, email), " +
        "trip:trips!reservations_trip_id_fkey(id, departure_date, departure_time, status, route:routes(name, origin_label, destination_label)), " +
        "return_trip:trips!reservations_return_trip_id_fkey(id, departure_date, departure_time, route:routes(name)), " +
        "reservation_passengers(id, name, is_primary, is_boarded, is_no_show), " +
        "payments(id, method, status, amount_cents, refund_amount_cents, notes)"
      )
      .eq("id", id)
      .single();

    if (err || !data) {
      setNotFound(true);
    } else {
      setResv(data);
      setNotes(data.special_notes ?? "");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const seatCount = resv ? (resv.adults ?? 0) + (resv.children ?? 0) : 0;

  const updateStatus = async (status: string) => {
    setBusy(true);
    setError("");
    const { error: err } = await sb.from("reservations").update({ status }).eq("id", id);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  const cancelReservation = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: err } = await sb
        .from("reservations")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", id);
      if (err) throw new Error(err.message);

      // Release the seats back to the trip(s)
      await sb.rpc("decrement_seats_booked", { p_trip_id: resv.trip_id, p_count: seatCount });
      if (resv.return_trip_id) {
        await sb.rpc("decrement_seats_booked", { p_trip_id: resv.return_trip_id, p_count: seatCount });
      }
      setConfirmCancel(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
    }
    setBusy(false);
  };

  const saveNotes = async () => {
    setBusy(true);
    setNotesSaved(false);
    const { error: err } = await sb
      .from("reservations")
      .update({ special_notes: notes.trim() || null })
      .eq("id", id);
    if (err) setError(err.message);
    else setNotesSaved(true);
    setBusy(false);
  };

  const markPaymentPaid = async (paymentId: string) => {
    setBusy(true);
    const { error: err } = await sb.from("payments").update({ status: "paid" }).eq("id", paymentId);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  if (notFound || !resv) {
    return (
      <div className="flex flex-col items-center py-24 gap-3">
        <AlertCircle className="w-10 h-10 text-[#A1A1AA]" />
        <p className="text-white font-semibold">Reservation not found</p>
        <Link href="/dashboard/reservations" className="text-[#7C3AED] hover:underline text-sm">
          ← Back to reservations
        </Link>
      </div>
    );
  }

  const trip = resv.trip;
  const passengers = resv.reservation_passengers ?? [];
  const payments = resv.payments ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/reservations">
            <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white font-mono">{resv.confirmation_number}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[resv.status] ?? ""}`}>
                {resv.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-[#A1A1AA] text-sm mt-0.5">
              Booked {new Date(resv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Status actions */}
        {resv.status !== "cancelled" && (
          <div className="flex items-center gap-2">
            {resv.status !== "completed" && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => updateStatus("completed")}
                className="border-white/15 text-white hover:bg-white/5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Completed
              </Button>
            )}
            {resv.status !== "no_show" && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => updateStatus("no_show")}
                className="border-white/15 text-[#A1A1AA] hover:bg-white/5 text-xs">
                No Show
              </Button>
            )}
            {(resv.status === "completed" || resv.status === "no_show") && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => updateStatus("confirmed")}
                className="border-white/15 text-[#A1A1AA] hover:bg-white/5 text-xs">
                Re-confirm
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Trip card */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-[#7C3AED]" />
          <h2 className="text-white font-semibold">Trip</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: MapPin, label: "Route", value: trip?.route?.name ?? "—" },
            { icon: Calendar, label: "Date", value: trip ? formatDateLong(trip.departure_date) : "—" },
            { icon: Clock, label: "Departure", value: trip ? formatTime12h(trip.departure_time) : "—" },
            { icon: Users, label: "Seats", value: `${seatCount} (${resv.adults} adult${resv.adults !== 1 ? "s" : ""}${resv.children ? `, ${resv.children} child${resv.children !== 1 ? "ren" : ""}` : ""})` },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="bg-white/3 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[#A1A1AA] text-xs mb-1">
                  <Icon className="w-3 h-3 text-[#7C3AED]" />{f.label}
                </div>
                <div className="text-white text-sm font-medium">{f.value}</div>
              </div>
            );
          })}
        </div>
        {(resv.pets > 0 || resv.extra_bags > 0) && (
          <div className="flex gap-4 mt-3 text-[#A1A1AA] text-sm">
            {resv.pets > 0 && <span>{resv.pets} pet{resv.pets !== 1 ? "s" : ""}</span>}
            {resv.extra_bags > 0 && <span>{resv.extra_bags} extra bag{resv.extra_bags !== 1 ? "s" : ""}</span>}
          </div>
        )}
        {resv.return_trip && (
          <div className="mt-3 text-[#A1A1AA] text-sm">
            Return: {resv.return_trip.route?.name} · {formatDateLong(resv.return_trip.departure_date)} · {formatTime12h(resv.return_trip.departure_time)}
          </div>
        )}
        {resv.trip_id && (
          <div className="mt-4">
            <Link href={`/dashboard/manifest?tripId=${resv.trip_id}`} className="text-[#7C3AED] hover:text-[#9D5FF5] text-sm font-medium transition-colors">
              View trip manifest →
            </Link>
          </div>
        )}
      </div>

      {/* Customer */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Customer</h2>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-white font-medium">
              {resv.customer ? `${resv.customer.first_name} ${resv.customer.last_name}` : "—"}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-[#A1A1AA] text-sm flex-wrap">
              {resv.customer?.phone && (
                <a href={`tel:${resv.customer.phone}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                  <Phone className="w-3.5 h-3.5 text-[#7C3AED]" />{resv.customer.phone}
                </a>
              )}
              {resv.customer?.email && !resv.customer.email.endsWith("@walkin.volt") && (
                <a href={`mailto:${resv.customer.email}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                  <Mail className="w-3.5 h-3.5 text-[#7C3AED]" />{resv.customer.email}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Passenger list */}
        {passengers.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-[#A1A1AA] text-xs uppercase tracking-wider mb-2">Passengers</div>
            {passengers.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className={p.is_no_show ? "text-red-400 line-through" : "text-white"}>{p.name}</span>
                {p.is_primary && <span className="text-[#7C3AED] text-xs bg-[#7C3AED]/10 px-1.5 py-0.5 rounded">Lead</span>}
                {p.is_boarded && <span className="text-green-400 text-xs">Boarded</span>}
                {p.is_no_show && <span className="text-red-400 text-xs">No show</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment — amounts are owner/manager only. Other roles see payment
          status (paid / unpaid) and can still record a payment as taken. */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Payment</h2>
        {showMoney && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Subtotal</span>
              <span className="text-white">{formatCents(resv.subtotal_cents)}</span>
            </div>
            {resv.discount_cents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#A1A1AA]">Discount</span>
                <span className="text-green-400">−{formatCents(resv.discount_cents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-white/10 pt-2">
              <span className="text-white">Total</span>
              <span className="text-[#7C3AED]">{formatCents(resv.total_cents)}</span>
            </div>
          </div>
        )}

        {payments.length === 0 ? (
          <p className="text-[#A1A1AA] text-sm">No payment record.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p: any) => {
              const Icon = PAY_ICONS[p.method as keyof typeof PAY_ICONS] ?? CreditCard;
              return (
                <div key={p.id} className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-[#7C3AED]" />
                    <div>
                      <div className="text-white text-sm font-medium capitalize">
                        {p.method === "stripe" ? "Card" : p.method}
                        {showMoney && ` · ${formatCents(p.amount_cents)}`}
                      </div>
                      {p.notes && <div className="text-[#A1A1AA] text-xs">{p.notes}</div>}
                      {showMoney && p.refund_amount_cents > 0 && (
                        <div className="text-orange-400 text-xs">Refunded {formatCents(p.refund_amount_cents)}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      p.status === "paid" ? "bg-green-500/15 text-green-400"
                      : p.status === "pending" ? "bg-yellow-500/15 text-yellow-400"
                      : p.status === "refunded" ? "bg-orange-500/15 text-orange-400"
                      : "bg-red-500/15 text-red-400"
                    }`}>{p.status}</span>
                    {p.status === "pending" && (
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => markPaymentPaid(p.id)}
                        className="border-white/15 text-white hover:bg-white/5 text-xs">
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {showMoney && (
          <p className="text-[#A1A1AA] text-xs mt-3">
            Refunds are issued from the <Link href="/dashboard/payments" className="text-[#7C3AED] hover:underline">Payments</Link> page.
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-[#7C3AED]" />
          <h2 className="text-white font-semibold">Special Notes</h2>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
          placeholder="Wheelchair, oversized luggage, pickup notes…"
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#7C3AED] min-h-[80px]"
        />
        <div className="flex items-center gap-3 mt-3">
          <Button size="sm" disabled={busy} onClick={saveNotes}
            className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white text-xs font-semibold">
            Save Notes
          </Button>
          {notesSaved && (
            <span className="flex items-center gap-1 text-green-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Cancel */}
      {resv.status !== "cancelled" && (
        <div className="glass rounded-2xl p-6 border-red-500/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-white font-semibold">Cancel Reservation</div>
              <div className="text-[#A1A1AA] text-sm mt-0.5">
                Releases {seatCount} seat{seatCount !== 1 ? "s" : ""} back to the trip. This can&apos;t be undone.
              </div>
            </div>
            {confirmCancel ? (
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy} onClick={cancelReservation}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Cancel It"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}
                  className="border-white/15 text-white hover:bg-white/5 text-xs">
                  Keep Reservation
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs">
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel Reservation
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
