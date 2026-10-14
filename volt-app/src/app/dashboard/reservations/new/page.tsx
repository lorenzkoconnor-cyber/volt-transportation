"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PRICING, generateConfirmationNumber } from "@/lib/booking";
import { formatTime12h, formatCents, localDateString } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StaffCardPayment, type StaffCardHandle } from "@/components/admin/StaffCardPayment";
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, Plus, X,
  User, MapPin, CreditCard, Banknote, Gift, SplitSquareHorizontal,
} from "lucide-react";

interface Route {
  id: string;
  name: string;
}

interface TripSlot {
  id: string;
  departure_time: string;
  total_capacity: number;
  seats_booked: number;
}

type PayMethod = "cash" | "stripe" | "split" | "comp";

export default function NewReservationPage() {
  const router = useRouter();
  const { employee } = useAuth();
  const supabase = createClient();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState("");
  const [date, setDate] = useState(localDateString());
  const [slots, setSlots] = useState<TripSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [tripId, setTripId] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");

  const [adults, setAdults]       = useState(1);
  const [children, setChildren]   = useState(0);
  const [pets, setPets]           = useState(0);
  const [extraBags, setExtraBags] = useState(0);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [notes, setNotes]         = useState("");

  const [discount, setDiscount]   = useState(0);   // dollars or percent, per discountType
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payNow, setPayNow]       = useState(true);
  const [splitCash, setSplitCash] = useState("");   // dollars, split payments only
  const cardRef = useRef<StaffCardHandle>(null);

  // Set once the reservation is saved but its card charge still needs to go
  // through — the button then only retries the card (no duplicate booking).
  const [created, setCreated] = useState<{ id: string; confirmation: string; cardPaymentId: string } | null>(null);

  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  useEffect(() => {
    sb.from("routes")
      .select("id, name")
      .eq("is_active", true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: any) => {
        setRoutes(data ?? []);
        if (data?.length) setRouteId(data[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load available departures whenever route/date changes
  useEffect(() => {
    if (!routeId || !date) return;
    setSlotsLoading(true);
    setTripId("");
    sb.from("trips")
      .select("id, departure_time, total_capacity, seats_booked")
      .eq("route_id", routeId)
      .eq("departure_date", date)
      .eq("status", "scheduled")
      .order("departure_time")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: any) => {
        setSlots(data ?? []);
        setSlotsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, date]);

  const subtotal =
    adults * PRICING.adult +
    children * PRICING.child +
    pets * PRICING.pet +
    extraBags * PRICING.extraBag;
  const isComp = payMethod === "comp";
  const subtotalCents = subtotal * 100;
  const discountCents = isComp ? subtotalCents : Math.min(
    subtotalCents,
    discountType === "percent" ? Math.round((subtotalCents * Math.min(discount, 100)) / 100) : Math.round(discount * 100),
  );
  const totalCents = subtotalCents - discountCents;
  const splitCashCents = Math.round((parseFloat(splitCash) || 0) * 100);
  const cardCents =
    payMethod === "split" ? totalCents - splitCashCents
    : payMethod === "stripe" ? totalCents
    : 0;
  // Card taken on this screen: always for split, and for Card unless "collect later".
  const chargeCardNow = cardCents > 0 && (payMethod === "split" || (payMethod === "stripe" && payNow));
  const seatCount = adults + children;

  const selectedSlot = slots.find((s) => s.id === tripId);
  const seatsLeft = selectedSlot ? selectedSlot.total_capacity - selectedSlot.seats_booked : null;

  const chargeCard = async (resv: { id: string; confirmation: string; cardPaymentId: string }) => {
    try {
      await cardRef.current!.charge(resv.cardPaymentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The card was declined.";
      setError(
        `Reservation ${resv.confirmation} is saved, but the card didn't go through: ${msg} ` +
        `Fix the card details and press Retry Card, or charge it later from the reservation page.`,
      );
      setSaving(false);
      return;
    }
    router.push(`/dashboard/reservations/${resv.id}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Reservation already saved — only the card is left.
    if (created) {
      const cardErr = cardRef.current?.validate();
      if (cardErr) { setError(cardErr); return; }
      setSaving(true);
      await chargeCard(created);
      return;
    }

    if (!tripId) { setError("Select a departure time."); return; }
    if (seatsLeft !== null && seatCount > seatsLeft) {
      setError(`Only ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on this departure.`);
      return;
    }
    if (payMethod === "split") {
      if (splitCashCents <= 0 || splitCashCents >= totalCents) {
        setError("For a split payment, enter a cash amount between $0 and the total.");
        return;
      }
    }
    if (chargeCardNow) {
      if (cardCents < 50) { setError("Card charges must be at least $0.50 — take the rest in cash or mark it Comp."); return; }
      const cardErr = cardRef.current?.validate();
      if (cardErr) { setError(cardErr); return; }
    }

    setSaving(true);
    try {
      // 1. Customer record
      const { data: customer, error: custErr } = await sb
        .from("customers")
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || `${phone.replace(/\D/g, "")}@walkin.volt`,
          is_military: false,
        })
        .select()
        .single();
      if (custErr) throw new Error(custErr.message);

      // 2. Reservation
      const confirmation = generateConfirmationNumber();
      const { data: reservation, error: resErr } = await sb
        .from("reservations")
        .insert({
          confirmation_number: confirmation,
          customer_id: customer.id,
          trip_id: tripId,
          status: "confirmed",
          adults,
          children,
          pets,
          extra_bags: extraBags,
          is_round_trip: false,
          special_notes: notes.trim() || null,
          subtotal_cents: subtotalCents,
          discount_cents: discountCents,
          total_cents: totalCents,
          created_by_employee_id: employee?.id ?? null,
        })
        .select()
        .single();
      if (resErr) throw new Error(resErr.message);

      // 3. Passenger manifest
      const passengerInserts = [
        { reservation_id: reservation.id, name: `${firstName.trim()} ${lastName.trim()}`, is_primary: true },
        ...extraNames
          .filter((n) => n.trim())
          .map((name) => ({ reservation_id: reservation.id, name: name.trim(), is_primary: false })),
      ];
      const { error: paxErr } = await sb.from("reservation_passengers").insert(passengerInserts);
      if (paxErr) throw new Error(paxErr.message);

      // 4. Reserve seats (atomic, fails if trip is full)
      const { error: seatErr } = await sb.rpc("increment_seats_booked", {
        p_trip_id: tripId,
        p_count: seatCount,
      });
      if (seatErr) throw new Error("Not enough seats left on this departure.");

      // 5. Payment record(s) — a split is one cash row + one card row.
      // Card rows start pending and turn paid once Stripe charges the card.
      const paymentRows =
        isComp ? [{ method: "comp", status: "paid", amount_cents: 0, notes: "Complimentary booking" }]
        : payMethod === "split" ? [
            { method: "cash", status: "paid", amount_cents: splitCashCents, notes: "Split payment — cash part" },
            { method: "stripe", status: "pending", amount_cents: cardCents, notes: "Split payment — card part" },
          ]
        : payMethod === "stripe" ? [
            { method: "stripe", status: totalCents === 0 ? "paid" : "pending", amount_cents: totalCents, notes: chargeCardNow || totalCents === 0 ? null : "To be collected" },
          ]
        : [{ method: "cash", status: payNow ? "paid" : "pending", amount_cents: totalCents, notes: payNow ? null : "To be collected" }];

      const { data: payments, error: payErr } = await sb
        .from("payments")
        .insert(paymentRows.map((p) => ({ ...p, reservation_id: reservation.id, refund_amount_cents: 0 })))
        .select("id, method");
      if (payErr) throw new Error(payErr.message);

      if (chargeCardNow) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cardRow = (payments ?? []).find((p: any) => p.method === "stripe");
        const saved = { id: reservation.id, confirmation, cardPaymentId: cardRow.id };
        setCreated(saved);
        await chargeCard(saved);
        return;
      }

      router.push(`/dashboard/reservations/${reservation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation.");
      setSaving(false);
    }
  };

  const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#FCC300]";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reservations">
          <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Reservation</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">Book a passenger over the phone or at the counter</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={!!created} className="space-y-6 disabled:opacity-60">
        {/* Trip */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#FCC300]" />
            <h2 className="text-white font-semibold">Trip</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Route *</Label>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#FCC300]"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[#171717]">{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Date *</Label>
              <input
                type="date"
                required
                value={date}
                min={localDateString()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] [color-scheme:dark]"
              />
            </div>
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Departure Time *</Label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading departures…
              </div>
            ) : slots.length === 0 ? (
              <p className="text-[#A1A1AA] text-sm py-3">
                No scheduled departures for this date. Add one in <Link href="/dashboard/dispatch" className="text-[#FCC300] hover:underline">Dispatch</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
                {slots.map((s) => {
                  const left = s.total_capacity - s.seats_booked;
                  const full = left <= 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={full}
                      onClick={() => setTripId(s.id)}
                      className={`rounded-lg px-2 py-2 text-xs font-medium transition-all border ${
                        tripId === s.id
                          ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                          : full
                          ? "bg-white/3 text-[#A1A1AA]/40 border-white/5 cursor-not-allowed line-through"
                          : "bg-white/5 text-white border-white/10 hover:border-[#FCC300]/50"
                      }`}
                    >
                      {formatTime12h(s.departure_time)}
                      <span className={`block text-[10px] mt-0.5 ${tripId === s.id ? "text-[#0A0A0A]/70" : full ? "" : "text-[#A1A1AA]"}`}>
                        {full ? "Full" : `${left} left`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Customer */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#FCC300]" />
            <h2 className="text-white font-semibold">Customer</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">First Name *</Label>
              <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputCls} />
            </div>
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Last Name *</Label>
              <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputCls} />
            </div>
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone *</Label>
              <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(706) 555-0000" className={inputCls} />
            </div>
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Party */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Party</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { label: `Adults ($${PRICING.adult})`, value: adults, set: setAdults, min: 1 },
              { label: `Children ($${PRICING.child})`, value: children, set: setChildren, min: 0 },
              { label: `Pets ($${PRICING.pet})`, value: pets, set: setPets, min: 0 },
              { label: `Extra Bags ($${PRICING.extraBag})`, value: extraBags, set: setExtraBags, min: 0 },
            ] as const).map((f) => (
              <div key={f.label}>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">{f.label}</Label>
                <Input
                  type="number"
                  min={f.min}
                  max={16}
                  value={f.value}
                  onChange={(e) => f.set(Math.max(f.min, parseInt(e.target.value || "0", 10)))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          {/* Additional passenger names */}
          {seatCount > 1 && (
            <div className="space-y-2">
              <Label className="text-[#A1A1AA] text-xs block">Additional Passenger Names (for the manifest)</Label>
              {extraNames.map((name, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(e) => setExtraNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                    placeholder={`Passenger ${i + 2} name`}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraNames((prev) => prev.filter((_, j) => j !== i))}
                    className="w-10 h-10 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {extraNames.length < seatCount - 1 && (
                <button
                  type="button"
                  onClick={() => setExtraNames((prev) => [...prev, ""])}
                  className="flex items-center gap-1.5 text-[#FCC300] hover:text-[#FFD54A] text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add passenger name
                </button>
              )}
            </div>
          )}

          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Special Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wheelchair, oversized luggage, pickup notes…"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#FCC300] min-h-[70px]"
            />
          </div>
        </div>

        </fieldset>

        {/* Payment */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Payment</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { key: "cash", label: "Cash", icon: Banknote },
              { key: "stripe", label: "Card", icon: CreditCard },
              { key: "split", label: "Split", icon: SplitSquareHorizontal },
              { key: "comp", label: "Comp (Free)", icon: Gift },
            ] as const).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  disabled={!!created}
                  onClick={() => setPayMethod(m.key)}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    payMethod === m.key
                      ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                      : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#FCC300]/50 hover:text-white"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <Icon className="w-4 h-4" />{m.label}
                </button>
              );
            })}
          </div>

          {!isComp && (
            <fieldset disabled={!!created} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Discount</Label>
                <div className="flex gap-2">
                  <div className="flex rounded-xl border border-white/10 overflow-hidden flex-shrink-0">
                    {([["amount", "$"], ["percent", "%"]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setDiscountType(key); setDiscount(0); }}
                        className={`w-10 h-10 text-sm font-semibold transition-colors ${
                          discountType === key ? "bg-[#FCC300] text-[#0A0A0A]" : "bg-white/5 text-[#A1A1AA] hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "percent" ? 100 : subtotal}
                    step={discountType === "percent" ? 1 : 0.01}
                    value={discount || ""}
                    placeholder="0"
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className={inputCls}
                  />
                </div>
              </div>
              {payMethod === "split" ? (
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Cash received ($) — rest goes on the card</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    max={totalCents / 100}
                    value={splitCash}
                    onChange={(e) => setSplitCash(e.target.value)}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
              ) : (
                <label className="flex items-center gap-2.5 h-10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payNow}
                    onChange={(e) => setPayNow(e.target.checked)}
                    className="w-4 h-4 accent-[#FCC300]"
                  />
                  <span className="text-white text-sm">
                    {payMethod === "stripe" ? "Charge card now (uncheck to collect later)" : "Payment collected (cash received)"}
                  </span>
                </label>
              )}
            </fieldset>
          )}

          {chargeCardNow && <StaffCardPayment ref={cardRef} amountCents={cardCents} />}

          {/* Price summary */}
          <div className="bg-white/3 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Subtotal</span>
              <span className="text-white">${subtotal}</span>
            </div>
            {!isComp && discountCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#A1A1AA]">Discount{discountType === "percent" ? ` (${Math.min(discount, 100)}%)` : ""}</span>
                <span className="text-green-400">−{formatCents(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-1">
              <span className="text-white">Total</span>
              <span className="text-[#FCC300] text-lg">{formatCents(totalCents)}</span>
            </div>
            {payMethod === "split" && (
              <>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-[#A1A1AA]">Cash</span>
                  <span className="text-white">${(splitCashCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#A1A1AA]">Card</span>
                  <span className="text-white">${(Math.max(0, cardCents) / 100).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={saving || !tripId}
          className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-12 rounded-xl disabled:opacity-60"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{created ? "Charging card…" : chargeCardNow ? "Creating reservation & charging card…" : "Creating reservation…"}</>
            : created
            ? <><CreditCard className="w-4 h-4 mr-2" />Retry Card · ${(cardCents / 100).toFixed(2)}</>
            : <><CheckCircle2 className="w-4 h-4 mr-2" />{chargeCardNow ? `Create Reservation & Charge $${(cardCents / 100).toFixed(2)}` : "Create Reservation"}</>}
        </Button>
        {created && (
          <Link href={`/dashboard/reservations/${created.id}`} className="block text-center text-[#A1A1AA] hover:text-white text-sm transition-colors">
            Charge the card later — open reservation {created.confirmation} →
          </Link>
        )}
      </form>
    </div>
  );
}
