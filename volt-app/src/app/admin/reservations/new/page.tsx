"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PRICING, generateConfirmationNumber } from "@/lib/booking";
import { formatTime12h, localDateString } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, Plus, X,
  User, MapPin, CreditCard, Banknote, Gift,
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

type PayMethod = "cash" | "stripe" | "comp";

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

  const [discount, setDiscount]   = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payNow, setPayNow]       = useState(true);

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
  const total = Math.max(0, subtotal - discount);
  const seatCount = adults + children;

  const selectedSlot = slots.find((s) => s.id === tripId);
  const seatsLeft = selectedSlot ? selectedSlot.total_capacity - selectedSlot.seats_booked : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!tripId) { setError("Select a departure time."); return; }
    if (seatsLeft !== null && seatCount > seatsLeft) {
      setError(`Only ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left on this departure.`);
      return;
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
      const isComp = payMethod === "comp";
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
          subtotal_cents: subtotal * 100,
          discount_cents: (isComp ? subtotal : discount) * 100,
          total_cents: isComp ? 0 : total * 100,
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

      // 5. Payment record
      const { error: payErr } = await sb.from("payments").insert({
        reservation_id: reservation.id,
        method: payMethod,
        status: isComp || payNow ? "paid" : "pending",
        amount_cents: isComp ? 0 : total * 100,
        refund_amount_cents: 0,
        notes: isComp ? "Complimentary booking" : payNow ? null : "To be collected",
      });
      if (payErr) throw new Error(payErr.message);

      router.push(`/admin/reservations/${reservation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation.");
      setSaving(false);
    }
  };

  const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/reservations">
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
        {/* Trip */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#7C3AED]" />
            <h2 className="text-white font-semibold">Trip</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Route *</Label>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]"
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
                className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]"
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
                No scheduled departures for this date. Add one in <Link href="/admin/dispatch" className="text-[#7C3AED] hover:underline">Dispatch</Link>.
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
                          ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                          : full
                          ? "bg-white/3 text-[#A1A1AA]/40 border-white/5 cursor-not-allowed line-through"
                          : "bg-white/5 text-white border-white/10 hover:border-[#7C3AED]/50"
                      }`}
                    >
                      {formatTime12h(s.departure_time)}
                      <span className={`block text-[10px] mt-0.5 ${tripId === s.id ? "text-white/80" : full ? "" : "text-[#A1A1AA]"}`}>
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
            <User className="w-4 h-4 text-[#7C3AED]" />
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
                  className="flex items-center gap-1.5 text-[#7C3AED] hover:text-[#9D5FF5] text-xs font-medium transition-colors"
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
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#7C3AED] min-h-[70px]"
            />
          </div>
        </div>

        {/* Payment */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Payment</h2>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "cash", label: "Cash", icon: Banknote },
              { key: "stripe", label: "Card", icon: CreditCard },
              { key: "comp", label: "Comp (Free)", icon: Gift },
            ] as const).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPayMethod(m.key)}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    payMethod === m.key
                      ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                      : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#7C3AED]/50 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />{m.label}
                </button>
              );
            })}
          </div>

          {payMethod !== "comp" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Discount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  max={subtotal}
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseInt(e.target.value || "0", 10)))}
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2.5 h-10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={payNow}
                  onChange={(e) => setPayNow(e.target.checked)}
                  className="w-4 h-4 accent-[#7C3AED]"
                />
                <span className="text-white text-sm">
                  Payment collected {payMethod === "stripe" ? "(card charged)" : "(cash received)"}
                </span>
              </label>
            </div>
          )}

          {/* Price summary */}
          <div className="bg-white/3 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Subtotal</span>
              <span className="text-white">${subtotal}</span>
            </div>
            {payMethod !== "comp" && discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#A1A1AA]">Discount</span>
                <span className="text-green-400">−${discount}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-1">
              <span className="text-white">Total</span>
              <span className="text-[#7C3AED] text-lg">${payMethod === "comp" ? 0 : total}</span>
            </div>
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
          className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold h-12 rounded-xl disabled:opacity-60"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating reservation…</>
            : <><CheckCircle2 className="w-4 h-4 mr-2" />Create Reservation</>}
        </Button>
      </form>
    </div>
  );
}
