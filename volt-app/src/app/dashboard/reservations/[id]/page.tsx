"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { canViewFinancials } from "@/lib/permissions";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { useAppSettings } from "@/context/SettingsContext";
import { createClient } from "@/lib/supabase/client";
import { formatCents, easternToday } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StaffCardPayment, type StaffCardHandle } from "@/components/admin/StaffCardPayment";
import { editAccess, reservationBalance } from "@/lib/staff-pricing";
import { TripLegTimeline } from "@/components/admin/TripTimeline";
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, XCircle,
  Phone, Mail, Users, MapPin, CreditCard, Banknote, Gift, FileText,
  Pencil, Printer, MessageSquare, History, Undo2, Lock, Trash2,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-500/15 text-green-400",
  pending:   "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-[#FCC300]/15 text-[#FCC300]",
  no_show:   "bg-orange-500/15 text-orange-400",
};

const PAY_ICONS = { stripe: CreditCard, cash: Banknote, comp: Gift } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const justUpdated = useSearchParams().get("updated") === "1";
  const role = useDashboardRole();
  const settings = useAppSettings();
  const showMoney = canViewFinancials(role);
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
  const [waiveFee, setWaiveFee] = useState(false);
  const [chargingId, setChargingId] = useState<string | null>(null);   // card payment being taken
  const cardRef = useRef<StaffCardHandle>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("reservations")
      .select(
        "*, " +
        "customer:customers(id, first_name, last_name, phone, email), " +
        "trip:trips!reservations_trip_id_fkey(id, departure_date, departure_time, status, route:routes(name, origin_key, origin_label, destination_label, duration_minutes)), " +
        "return_trip:trips!reservations_return_trip_id_fkey(id, departure_date, departure_time, route:routes(name, origin_key, duration_minutes)), " +
        "reservation_passengers(id, name, is_primary, is_boarded, is_no_show), " +
        "payments(id, method, status, amount_cents, refund_amount_cents, notes, reservation_change_id, created_at), " +
        "reservation_flights(id, leg, direction, airline, flight_number, terminal, flight_date, flight_time)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (err || !data) {
      setNotFound(true);
    } else {
      setResv(data);
      setNotes(data.special_notes ?? "");
      const { data: changes } = await sb
        .from("reservation_changes")
        .select("id, action, status, summary, employee_name, created_at, error")
        .eq("reservation_id", id)
        .in("status", ["applied", "failed"])
        .order("created_at", { ascending: false });
      setHistory(changes ?? []);
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
    setNotice("");
    try {
      const res = await fetch(`/api/reservations/${id}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waiveFee }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to cancel.");
      setNotice(`Cancelled. ${[...data.lines.slice(1), ...data.problems].join(" · ")}.`);
      if (data.problems?.length) setError(`Needs attention: ${data.problems.join(" ")}`);
      setConfirmCancel(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel.");
    }
    setBusy(false);
  };

  const deleteReservation = async () => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      router.replace("/dashboard/reservations");
      return;
    }
    setError(data.error ?? "Couldn't delete the reservation.");
    setConfirmDelete(false);
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

  const sendText = async (type: "confirmation" | "receipt", channel: "sms" | "email" = "sms") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/reservations/${id}/notify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The text could not be sent.");
      setNotice(`${type === "confirmation" ? "Confirmation" : "Receipt link"} ${channel === "email" ? "emailed" : "texted"} to ${data.to}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The text could not be sent.");
    }
    setBusy(false);
  };

  const refundDifference = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/reservations/${id}/refund`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Refund failed.");
      setNotice(`Refunded: ${data.lines.join(" · ")}.`);
      setConfirmRefund(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
    }
    setBusy(false);
  };

  const chargeCard = async (paymentId: string) => {
    const cardErr = cardRef.current?.validate();
    if (cardErr) { setError(cardErr); return; }
    setBusy(true);
    setError("");
    try {
      await cardRef.current!.charge(paymentId);
      setChargingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The card was declined.");
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" />
      </div>
    );
  }

  if (notFound || !resv) {
    return (
      <div className="flex flex-col items-center py-24 gap-3">
        <AlertCircle className="w-10 h-10 text-[#A1A1AA]" />
        <p className="text-white font-semibold">Reservation not found</p>
        <Link href="/dashboard/reservations" className="text-[#FCC300] hover:underline text-sm">
          ← Back to reservations
        </Link>
      </div>
    );
  }

  const trip = resv.trip;
  const passengers = resv.reservation_passengers ?? [];
  // A card row for an edit that was never paid isn't a real payment — hide it.
  const payments = (resv.payments ?? []).filter((p: any) => !(p.reservation_change_id && p.status === "pending"));
  const access = editAccess(role, resv.status, trip, resv.is_round_trip ? resv.return_trip : null, undefined, settings);
  const { refundDueCents } = reservationBalance(resv.total_cents, resv.payments ?? []);
  const receiptHref = `/receipt/${resv.receipt_token}`;
  // Upcoming reservations must be cancelled before they can be deleted.
  const today = easternToday();
  const isUpcoming = [trip?.departure_date, resv.return_trip?.departure_date].some((d) => d && d >= today);
  const canDelete = (role === "owner" || role === "manager") && (resv.status === "cancelled" || !isUpcoming);
  const customerEmail = resv.customer?.email && !/@(walkin|guest)\.volt$/.test(resv.customer.email) ? resv.customer.email : "";

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
          <div className="flex items-center gap-2 flex-wrap">
            {!access.mode ? (
              <span title={access.reason ?? ""} className="flex items-center gap-1 text-[#A1A1AA] text-xs px-2 max-w-[260px]">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {access.reason}
              </span>
            ) : (
              <Link href={`/dashboard/reservations/${id}/edit`}>
                <Button size="sm" className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold">
                  <Pencil className="w-3.5 h-3.5 mr-1" /> {access.mode === "return_only" ? "Edit Return Trip" : "Edit Reservation"}
                </Button>
              </Link>
            )}
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

      {notice && (
        <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-green-400 text-sm">{notice}</p>
        </div>
      )}
      {justUpdated && !notice && (
        <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-green-400 text-sm">Reservation updated. The customer was texted the new details.</p>
        </div>
      )}

      {/* Refund owed after an edit lowered the price */}
      {refundDueCents > 0 && (
        <div className="glass rounded-2xl p-5 border border-green-500/30 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-white font-semibold flex items-center gap-2">
              <Undo2 className="w-4 h-4 text-green-400" /> Refund owed: {formatCents(refundDueCents)}
            </div>
            <div className="text-[#A1A1AA] text-sm mt-0.5">
              The customer paid more than the new total. Card payments go back to the card; cash is handed back.
            </div>
          </div>
          {confirmRefund ? (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={busy} onClick={refundDifference}
                className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Yes, refund ${formatCents(refundDueCents)}`}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmRefund(false)}
                className="border-white/15 text-white hover:bg-white/5 text-xs">
                Not now
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => setConfirmRefund(true)}
              className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold">
              <Undo2 className="w-3.5 h-3.5 mr-1" /> Refund {formatCents(refundDueCents)}
            </Button>
          )}
        </div>
      )}

      {/* Receipt + texts */}
      <div className="glass rounded-2xl p-5">
        <div className="text-white font-semibold mb-3">Receipt &amp; Confirmation</div>
        <div className="flex flex-wrap gap-2">
          <a href={`${receiptHref}?print=1`} target="_blank" rel="noopener">
            <Button size="sm" variant="outline" className="border-white/15 text-white hover:bg-white/5 text-xs">
              <Printer className="w-3.5 h-3.5 mr-1" /> Print Receipt
            </Button>
          </a>
          <Button size="sm" variant="outline" disabled={busy || !customerEmail} onClick={() => sendText("receipt", "email")}
            title={customerEmail ? `Email the receipt to ${customerEmail}` : "No email address on file"}
            className="border-white/15 text-white hover:bg-white/5 text-xs">
            <Mail className="w-3.5 h-3.5 mr-1" /> Email Receipt
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !customerEmail} onClick={() => sendText("confirmation", "email")}
            title={customerEmail ? `Email the confirmation to ${customerEmail}` : "No email address on file"}
            className="border-white/15 text-white hover:bg-white/5 text-xs">
            <Mail className="w-3.5 h-3.5 mr-1" /> Email Confirmation
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !resv.customer?.phone} onClick={() => sendText("receipt")}
            className="border-white/15 text-white hover:bg-white/5 text-xs">
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Text Receipt
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !resv.customer?.phone} onClick={() => sendText("confirmation")}
            className="border-white/15 text-white hover:bg-white/5 text-xs">
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Text Confirmation
          </Button>
        </div>
        <p className="text-[#A1A1AA] text-xs mt-2">
          The receipt lists the trip, passengers, charges and how they paid — use it alongside the Square slip.
        </p>
      </div>

      {/* Trip card */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-[#FCC300]" />
          <h2 className="text-white font-semibold">Trip</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-4 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 text-white">
            <Users className="w-3.5 h-3.5 text-[#FCC300]" />
            {seatCount} seat{seatCount !== 1 ? "s" : ""} · {resv.adults} adult{resv.adults !== 1 ? "s" : ""}
            {resv.children ? `, ${resv.children} child${resv.children !== 1 ? "ren" : ""}` : ""}
          </span>
          <span className="bg-white/5 rounded-full px-3 py-1 text-white">{resv.return_trip ? "Round trip" : "One way"}</span>
          {resv.pets > 0 && <span className="bg-white/5 rounded-full px-3 py-1 text-white">{resv.pets} pet{resv.pets !== 1 ? "s" : ""}</span>}
          {resv.extra_bags > 0 && <span className="bg-white/5 rounded-full px-3 py-1 text-white">{resv.extra_bags} extra bag{resv.extra_bags !== 1 ? "s" : ""}</span>}
        </div>
        {trip ? (
          <div className={`grid gap-4 ${resv.return_trip ? "lg:grid-cols-2" : ""}`}>
            <TripLegTimeline
              label={resv.return_trip ? "Outbound" : "Trip"}
              trip={trip}
              flight={(resv.reservation_flights ?? []).find((f: any) => f.leg === "outbound") ?? null}
              routeMinutes={settings.schedule.toAtl.durationMinutes}
              arriveEarlyMinutes={settings.arriveEarlyMinutes}
              voltAddress={settings.business.address}
            />
            {resv.return_trip && (
              <TripLegTimeline
                label="Return"
                trip={resv.return_trip}
                flight={(resv.reservation_flights ?? []).find((f: any) => f.leg === "return") ?? null}
                routeMinutes={settings.schedule.fromAtl.durationMinutes}
                arriveEarlyMinutes={settings.arriveEarlyMinutes}
                voltAddress={settings.business.address}
              />
            )}
          </div>
        ) : (
          <p className="text-[#A1A1AA] text-sm">No trip on this reservation.</p>
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
                  <Phone className="w-3.5 h-3.5 text-[#FCC300]" />{resv.customer.phone}
                </a>
              )}
              {resv.customer?.email && !resv.customer.email.endsWith("@walkin.volt") && (
                <a href={`mailto:${resv.customer.email}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                  <Mail className="w-3.5 h-3.5 text-[#FCC300]" />{resv.customer.email}
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
                {p.is_primary && <span className="text-[#FCC300] text-xs bg-[#FCC300]/10 px-1.5 py-0.5 rounded">Lead</span>}
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
              <span className="text-[#FCC300]">{formatCents(resv.total_cents)}</span>
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
                <div key={p.id} className="space-y-2">
                <div className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-[#FCC300]" />
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
                      : p.status === "authorized" ? "bg-blue-500/15 text-blue-400"
                      : p.status === "voided" ? "bg-[#A1A1AA]/15 text-[#A1A1AA]"
                      : "bg-red-500/15 text-red-400"
                    }`}>{p.status === "authorized" ? "on hold" : p.status}</span>
                    {p.status === "pending" && p.method === "stripe" && resv.status !== "cancelled" && chargingId !== p.id && (
                      <Button size="sm" disabled={busy}
                        onClick={() => { setError(""); setChargingId(p.id); }}
                        className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold">
                        <CreditCard className="w-3.5 h-3.5 mr-1" /> Charge Card
                      </Button>
                    )}
                    {p.status === "pending" && (
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => markPaymentPaid(p.id)}
                        className="border-white/15 text-white hover:bg-white/5 text-xs">
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
                {chargingId === p.id && (
                  <div className="space-y-2">
                    <StaffCardPayment ref={cardRef} amountCents={p.amount_cents} />
                    <div className="flex items-center gap-2">
                      <Button size="sm" disabled={busy} onClick={() => chargeCard(p.id)}
                        className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Charge ${formatCents(p.amount_cents)}`}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setChargingId(null)}
                        className="border-white/15 text-white hover:bg-white/5 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
        {showMoney && (
          <p className="text-[#A1A1AA] text-xs mt-3">
            Refunds are issued from the <Link href="/dashboard/payments" className="text-[#FCC300] hover:underline">Payments</Link> page.
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-[#FCC300]" />
          <h2 className="text-white font-semibold">Special Notes</h2>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
          placeholder="Wheelchair, oversized luggage, pickup notes…"
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#FCC300] min-h-[80px]"
        />
        <div className="flex items-center gap-3 mt-3">
          <Button size="sm" disabled={busy} onClick={saveNotes}
            className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold">
            Save Notes
          </Button>
          {notesSaved && (
            <span className="flex items-center gap-1 text-green-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-[#FCC300]" />
            <h2 className="text-white font-semibold">History</h2>
          </div>
          <div className="space-y-3">
            {history.map((h: any) => (
              <div key={h.id} className="border-l-2 border-white/10 pl-3">
                <div className="text-sm text-white">
                  {h.action === "created" ? "Booked" : h.action === "edited" ? "Edited" : h.action === "refund" ? "Refund" : "Text sent"}
                  {h.employee_name && <span className="text-[#A1A1AA]"> by {h.employee_name}</span>}
                  {h.status === "failed" && <span className="text-red-400"> — not applied</span>}
                </div>
                <div className="text-[#A1A1AA] text-xs">
                  {new Date(h.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {(h.summary ?? [])
                    .filter((line: string) => showMoney || !/^Price:|\$/.test(line))
                    .map((line: string, i: number) => (
                      <li key={i} className="text-[#A1A1AA] text-xs">• {line}</li>
                    ))}
                  {h.error && <li className="text-red-400 text-xs">• {h.error}</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel */}
      {resv.status !== "cancelled" && (
        <div className="glass rounded-2xl p-6 border-red-500/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-white font-semibold">Cancel Reservation</div>
              <div className="text-[#A1A1AA] text-sm mt-0.5">
                Releases {seatCount} seat{seatCount !== 1 ? "s" : ""} back to the trip and refunds what was paid
                {waiveFee ? "" : ", minus the cancellation fee"} (card first, then cash to hand back). The customer is texted and
                emailed. This can&apos;t be undone.
              </div>
              {(role === "owner" || role === "manager") && (
                <label className="flex items-center gap-2 mt-2 text-sm text-[#A1A1AA] cursor-pointer">
                  <input type="checkbox" checked={waiveFee} onChange={(e) => setWaiveFee(e.target.checked)}
                    className="accent-[#FCC300]" />
                  Waive the cancellation fee
                </label>
              )}
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

      {/* Delete — owners/managers, past or cancelled reservations only */}
      {canDelete && (
        <div className="glass rounded-2xl p-6 border-red-500/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-white font-semibold">Delete Reservation</div>
              <div className="text-[#A1A1AA] text-sm mt-0.5">
                Removes it from Reservations, the Boarding List, the Calendar and the customer&apos;s account.
                Payment records are kept so Payments and Reports still add up.
              </div>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy} onClick={deleteReservation}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Delete It"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}
                  className="border-white/15 text-white hover:bg-white/5 text-xs">
                  Keep It
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Reservation
              </Button>
            )}
          </div>
        </div>
      )}
      {(role === "owner" || role === "manager") && !canDelete && resv.status !== "cancelled" && (
        <p className="text-[#A1A1AA] text-xs px-1">
          To delete this reservation, cancel it first. Past trips can be deleted without cancelling.
        </p>
      )}
    </div>
  );
}
