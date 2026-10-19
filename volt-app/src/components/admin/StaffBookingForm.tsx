"use client";

// Team Portal booking form — New Reservation and Edit Reservation.
// The trip is picked with the SAME steps riders use online (round trip,
// "I have a flight", airport-time picker), so staff have every option the
// website has. Then customer, passengers, discount, terms and payment.
//
// Prices shown here are a preview; /api/reservations/staff and
// /api/reservations/[id]/edit re-price everything on the server.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Step1Search from "@/components/booking/Step1Search";
import Step2Departures from "@/components/booking/Step2Departures";
import FlightFields from "@/components/booking/FlightFields";
import { StaffCardPayment, type StaffCardHandle } from "@/components/admin/StaffCardPayment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type BookingSearch, type DepartureSlot, type FlightInfo,
  EMPTY_FLIGHT, LOCATIONS, bookingFlights, flightDirection, flightSummary, formatDate, slotTimes,
} from "@/lib/booking";
import { formatCents, localDateString } from "@/lib/format";
import { codeLabel } from "@/lib/discount-codes";
import { staffPrice, staffDiscountLabel, type StaffDiscount, type StaffRates } from "@/lib/staff-pricing";
import { useAppSettings } from "@/context/SettingsContext";
import { dollars, snapshotPricing, type PricingSnapshot } from "@/lib/settings";
import {
  AlertCircle, ArrowLeftRight, Banknote, CheckCircle2, CreditCard, Gift, Loader2, MapPin, Pencil, Plane, Plus,
  ShieldCheck, SplitSquareHorizontal, Ticket, User, X,
} from "lucide-react";

export interface StaffCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface StaffFormInitial {
  search: BookingSearch;
  outbound: DepartureSlot | null;
  returnSlot: DepartureSlot | null;
  customer: StaffCustomer;
  additional: string[];
  notes: string;
  discount: StaffDiscount;
}

type Phase = "trip" | "departures" | "details" | "return" | "returnDepartures";
type PayMethod = "cash" | "stripe" | "split" | "comp";

interface Props {
  mode: "new" | "edit";
  initial: StaffFormInitial;
  reservationId?: string;
  oldTotalCents?: number;
  heldSeats?: Record<string, number>;
  // The outbound has left: only the return leg (and contact details) can change.
  returnOnly?: boolean;
  // Edit: the prices the booking was made at (reservations.pricing_snapshot).
  pricingSnapshot?: Partial<PricingSnapshot> | null;
}

interface Quote {
  summary: string[];
  oldTotalCents: number;
  newTotalCents: number;
  priceChangeCents: number;
  refundDueAfterCents: number;
}

const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#FCC300]";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export default function StaffBookingForm({
  mode, initial, reservationId, oldTotalCents = 0, heldSeats, returnOnly = false, pricingSnapshot = null,
}: Props) {
  const router = useRouter();
  const isEdit = mode === "edit";
  // New bookings use today's prices; edits keep the booking's own prices.
  const settings = useAppSettings();
  const rates: StaffRates = isEdit
    ? (() => { const s = snapshotPricing(pricingSnapshot); return { pricing: s.pricing, militaryAmount: s.militaryAmount }; })()
    : { pricing: settings.pricing, militaryAmount: settings.military.amount };
  const P = rates.pricing;

  const [phase, setPhaseState] = useState<Phase>(initial.outbound ? "details" : "trip");
  const setPhase = (p: Phase) => {
    setPhaseState(p);
    window.scrollTo({ top: 0 });
  };
  const [search, setSearch] = useState<BookingSearch>(initial.search);
  const [outbound, setOutbound] = useState<DepartureSlot | null>(initial.outbound);
  const [returnSlot, setReturnSlot] = useState<DepartureSlot | null>(initial.returnSlot);

  const [customer, setCustomer] = useState<StaffCustomer>(initial.customer);
  const seatCount = search.adults + search.children;
  const [additional, setAdditional] = useState<string[]>(initial.additional);
  const [notes, setNotes] = useState(initial.notes);

  const [discount, setDiscount] = useState<StaffDiscount>(initial.discount);
  const [codeInput, setCodeInput] = useState(initial.discount.kind === "code" ? initial.discount.code : "");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [manualType, setManualType] = useState<"amount" | "percent">(initial.discount.kind === "manual" ? initial.discount.type : "amount");
  const [manualValue, setManualValue] = useState(initial.discount.kind === "manual" ? String(initial.discount.value) : "");
  const [discountTab, setDiscountTab] = useState<StaffDiscount["kind"]>(initial.discount.kind);

  const [termsAgreed, setTermsAgreed] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payNow, setPayNow] = useState(true);
  const [splitCash, setSplitCash] = useState("");
  const cardRef = useRef<StaffCardHandle>(null);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [returnSearch, setReturnSearch] = useState<BookingSearch | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // A saved booking / started edit whose card still needs to go through.
  const [pendingCard, setPendingCard] = useState<{ cardPaymentId: string; changeId?: string; reservationId: string; label: string } | null>(null);

  // Any change to the form invalidates the edit quote.
  const touch = () => setQuote(null);

  // Effective discount from the tab + fields.
  const activeDiscount: StaffDiscount = useMemo(() => {
    if (discountTab === "military") return { kind: "military" };
    if (discountTab === "code") return discount.kind === "code" ? discount : { kind: "none" };
    if (discountTab === "manual") {
      const v = parseFloat(manualValue) || 0;
      return v > 0 ? { kind: "manual", type: manualType, value: v } : { kind: "none" };
    }
    return { kind: "none" };
  }, [discountTab, discount, manualType, manualValue]);

  const isComp = !isEdit && payMethod === "comp";
  const price = staffPrice(
    { adults: search.adults, children: search.children, pets: search.pets, extraBags: search.extraBags, isRoundTrip: search.roundTrip },
    activeDiscount,
    isComp,
    rates,
  );
  const priceChange = isEdit ? price.totalCents - oldTotalCents : price.totalCents;
  const due = isEdit ? Math.max(0, quote?.priceChangeCents ?? priceChange) : price.totalCents;
  const splitCashCents = Math.round((parseFloat(splitCash) || 0) * 100);
  const cardCents = payMethod === "split" ? due - splitCashCents : payMethod === "stripe" ? due : 0;
  const chargeCardNow = cardCents > 0 && (payMethod === "split" || (payMethod === "stripe" && (isEdit || payNow)));

  const applyCode = async () => {
    setCodeError("");
    setCodeBusy(true);
    try {
      const data = await postJson("/api/discount-codes/validate", { code: codeInput });
      setDiscount({ kind: "code", code: data.code, type: data.type, value: data.value });
      touch();
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "That code isn't valid.");
    }
    setCodeBusy(false);
  };

  const body = () => ({
    tripId: outbound?.id,
    returnTripId: search.roundTrip ? returnSlot?.id ?? null : null,
    isRoundTrip: search.roundTrip,
    adults: search.adults,
    children: search.children,
    pets: search.pets,
    extraBags: search.extraBags,
    additionalPassengers: additional.map((n) => n.trim()).filter(Boolean),
    specialNotes: notes.trim(),
    flights: outbound ? bookingFlights(search, outbound, search.roundTrip ? returnSlot : null) : [],
    customer: {
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
    },
    discount: activeDiscount,
    termsAgreed,
    smsConsent,
    payment: { method: payMethod, collectNow: payNow, splitCashCents },
  });

  // Checks shared by both modes before anything is sent.
  const validate = (): string | null => {
    if (!outbound) return "Pick a departure.";
    if (search.roundTrip && !returnSlot) return "Pick a return departure.";
    if (!customer.firstName.trim() || !customer.lastName.trim()) return "Enter the customer's first and last name.";
    if (customer.phone.replace(/\D/g, "").length < 10) return "Enter a 10-digit phone number.";
    if (discountTab === "code" && discount.kind !== "code") return "Apply the discount code, or choose a different discount.";
    if (!isEdit && !termsAgreed) return "Confirm the customer agreed to the Terms & Conditions.";
    return null;
  };

  const validatePayment = (): string | null => {
    if (due <= 0) return null;
    if (payMethod === "split" && (splitCashCents <= 0 || splitCashCents >= due)) {
      return `For a split payment, enter a cash amount between $0 and ${formatCents(due)}.`;
    }
    if (chargeCardNow) {
      if (cardCents < 50) return "Card charges must be at least $0.50 — take the rest in cash.";
      return cardRef.current?.validate() ?? null;
    }
    return null;
  };

  const goToReservation = (id: string, updated = false) =>
    router.push(`/dashboard/reservations/${id}${updated ? "?updated=1" : ""}`);

  // Charge a pending card payment, then (edits) apply the change.
  const runCard = async (pc: NonNullable<typeof pendingCard>) => {
    try {
      await cardRef.current!.charge(pc.cardPaymentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The card was declined.";
      setError(
        pc.changeId
          ? `The card didn't go through: ${msg} Nothing has been changed yet — fix the card and press Retry Card.`
          : `Reservation ${pc.label} is saved, but the card didn't go through: ${msg} Fix the card and press Retry Card, or charge it later from the reservation page.`,
      );
      setSaving(false);
      return;
    }
    if (pc.changeId) {
      try {
        await postJson(`/api/reservations/${pc.reservationId}/edit`, { action: "complete", changeId: pc.changeId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The card was charged but the change couldn't be applied.");
        setSaving(false);
        return;
      }
    }
    goToReservation(pc.reservationId, !!pc.changeId);
  };

  const submitNew = async () => {
    setError("");
    if (pendingCard) {
      const cardErr = cardRef.current?.validate();
      if (cardErr) { setError(cardErr); return; }
      setSaving(true);
      await runCard(pendingCard);
      return;
    }
    const err = validate() ?? validatePayment();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      const data = await postJson("/api/reservations/staff", body());
      if (data.cardPaymentId) {
        const pc = { cardPaymentId: data.cardPaymentId, reservationId: data.id, label: data.confirmationNumber };
        setPendingCard(pc);
        await runCard(pc);
        return;
      }
      goToReservation(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the reservation.");
      setSaving(false);
    }
  };

  const reviewEdit = async () => {
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      const q = await postJson(`/api/reservations/${reservationId}/edit`, { action: "quote", ...body() });
      if (!q.summary?.length) setError("Nothing has changed yet.");
      else setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the changes.");
    }
    setSaving(false);
  };

  const applyEdit = async () => {
    setError("");
    if (pendingCard) {
      const cardErr = cardRef.current?.validate();
      if (cardErr) { setError(cardErr); return; }
      setSaving(true);
      await runCard(pendingCard);
      return;
    }
    const err = validate() ?? validatePayment();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      const data = await postJson(`/api/reservations/${reservationId}/edit`, { action: "apply", ...body() });
      if (data.applied) { goToReservation(reservationId!, true); return; }
      const pc = { cardPaymentId: data.cardPaymentId, changeId: data.changeId, reservationId: reservationId!, label: "" };
      setPendingCard(pc);
      await runCard(pc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the reservation.");
      setSaving(false);
    }
  };

  // ── Return leg only (outbound already left) ────────────────────────────────
  if (phase === "return") {
    return (
      <ReturnLegSearch
        search={search}
        onBack={() => setPhase("details")}
        onSearch={(date, flight) => {
          setReturnSearch({
            ...search,
            from: search.to,
            to: search.from,
            roundTrip: false,
            date,
            returnDate: "",
            outboundFlight: flight,
            returnFlight: { ...EMPTY_FLIGHT },
          });
          setPhase("returnDepartures");
        }}
      />
    );
  }

  if (phase === "returnDepartures" && returnSearch) {
    return (
      <div className="glass rounded-2xl p-4 sm:p-6">
        <Step2Departures
          staff
          search={returnSearch}
          initialOutbound={returnSlot}
          heldSeats={heldSeats}
          nextLabel="Use This Return Trip"
          onNext={(slot) => {
            setReturnSlot(slot);
            setSearch((s) => ({ ...s, returnDate: returnSearch.date, returnFlight: returnSearch.outboundFlight }));
            touch();
            setPhase("details");
          }}
          onBack={() => setPhase("return")}
        />
      </div>
    );
  }

  // ── Trip picking (customer steps) ──────────────────────────────────────────
  if (phase === "trip") {
    return (
      <div className="glass rounded-2xl p-4 sm:p-6">
        <Step1Search
          initial={search}
          onNext={(s) => { setSearch(s); touch(); setPhase("departures"); }}
        />
        {outbound && (
          <button type="button" onClick={() => setPhase("details")} className="mt-4 w-full text-center text-[#A1A1AA] hover:text-white text-sm">
            Keep the current trip
          </button>
        )}
      </div>
    );
  }

  if (phase === "departures") {
    return (
      <div className="glass rounded-2xl p-4 sm:p-6">
        <Step2Departures
          staff
          search={search}
          initialOutbound={outbound}
          initialReturn={returnSlot}
          heldSeats={heldSeats}
          nextLabel="Continue to Customer & Payment"
          onNext={(ob, ret) => {
            setOutbound(ob);
            setReturnSlot(search.roundTrip ? ret : null);
            setAdditional((prev) => prev.slice(0, Math.max(0, search.adults + search.children - 1)));
            touch();
            setPhase("details");
          }}
          onBack={() => setPhase("trip")}
        />
      </div>
    );
  }

  // ── Details ────────────────────────────────────────────────────────────────
  const locked = !!pendingCard;
  const discountLabel = staffDiscountLabel(activeDiscount, rates);
  const lines: [string, number][] = [];
  const mult = search.roundTrip ? 2 : 1;
  if (search.adults) lines.push([`${search.adults} Adult${search.adults > 1 ? "s" : ""} × ${dollars(P.adult)}`, Math.round(search.adults * P.adult * 100 * mult)]);
  if (search.children) lines.push([`${search.children} Child${search.children > 1 ? "ren" : ""} × ${dollars(P.child)}`, Math.round(search.children * P.child * 100 * mult)]);
  if (search.pets) lines.push([`${search.pets} Pet${search.pets > 1 ? "s" : ""} × ${dollars(P.pet)}`, Math.round(search.pets * P.pet * 100 * mult)]);
  if (search.extraBags) lines.push([`${search.extraBags} Extra Bag${search.extraBags > 1 ? "s" : ""} × ${dollars(P.extraBag)}`, Math.round(search.extraBags * P.extraBag * 100 * mult)]);

  return (
    <div className="space-y-6">
      <fieldset disabled={locked || saving} className="space-y-6">
        {/* Trip summary */}
        <div className="glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#FCC300]" />
              <h2 className="text-white font-semibold">Trip</h2>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setPhase(returnOnly ? "return" : "trip")}
              className="border-white/15 text-white hover:bg-white/5 text-xs">
              <Pencil className="w-3.5 h-3.5 mr-1" /> {returnOnly ? "Change return trip" : "Change trip, date or party"}
            </Button>
          </div>
          {returnOnly && (
            <p className="text-[#A1A1AA] text-xs">
              The outbound trip has left, so only the return trip, contact details, names and notes can change.
            </p>
          )}
          {outbound && (
            <LegCard
              title={returnOnly ? "Outbound (departed)" : search.roundTrip ? "Outbound" : "Ride"}
              from={search.from} to={search.to} slot={outbound}
              flight={search.hasFlight ? flightSummary(search.outboundFlight, flightDirection(search.from)) : ""}
            />
          )}
          {search.roundTrip && returnSlot && (
            <LegCard
              title="Return" from={search.to} to={search.from} slot={returnSlot}
              flight={search.hasFlight ? flightSummary(search.returnFlight, flightDirection(search.to)) : ""}
            />
          )}
          <p className="text-[#A1A1AA] text-sm">
            {search.adults} adult{search.adults !== 1 ? "s" : ""}
            {search.children ? ` · ${search.children} child${search.children !== 1 ? "ren" : ""}` : ""}
            {search.pets ? ` · ${search.pets} pet${search.pets !== 1 ? "s" : ""}` : ""}
            {search.extraBags ? ` · ${search.extraBags} extra bag${search.extraBags !== 1 ? "s" : ""}` : ""}
            {search.roundTrip ? " · round trip" : " · one-way"}
          </p>
        </div>

        {/* Customer */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#FCC300]" />
            <h2 className="text-white font-semibold">Customer</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ["firstName", "First Name *", "First name", "text"],
              ["lastName", "Last Name *", "Last name", "text"],
              ["phone", "Phone *", "(706) 555-0000", "tel"],
              ["email", "Email (optional)", "customer@email.com", "email"],
            ] as const).map(([key, label, ph, type]) => (
              <div key={key}>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">{label}</Label>
                <Input type={type} value={customer[key]} placeholder={ph} className={inputCls}
                  onChange={(e) => { setCustomer((c) => ({ ...c, [key]: e.target.value })); touch(); }} />
              </div>
            ))}
          </div>
          <p className="text-[#A1A1AA] text-xs">The confirmation is texted to this phone number.</p>

          {seatCount > 1 && (
            <div className="space-y-2 pt-2">
              <Label className="text-[#A1A1AA] text-xs block">Other passenger names (for the boarding list)</Label>
              {additional.map((name, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={name} placeholder={`Passenger ${i + 2} name`} className={inputCls}
                    onChange={(e) => { setAdditional((prev) => prev.map((n, j) => (j === i ? e.target.value : n))); touch(); }} />
                  <button type="button" aria-label="Remove passenger name"
                    onClick={() => { setAdditional((prev) => prev.filter((_, j) => j !== i)); touch(); }}
                    className="w-10 h-10 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-red-400 transition-colors flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {additional.length < seatCount - 1 && (
                <button type="button" onClick={() => setAdditional((prev) => [...prev, ""])}
                  className="flex items-center gap-1.5 text-[#FCC300] hover:text-[#FFD54A] text-xs font-medium transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add passenger name
                </button>
              )}
            </div>
          )}

          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Special Notes (optional)</Label>
            <Textarea value={notes} placeholder="Wheelchair, oversized luggage, pickup notes…"
              onChange={(e) => { setNotes(e.target.value); touch(); }}
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#FCC300] min-h-[70px]" />
          </div>
        </div>

        {/* Discount */}
        {!isComp && !returnOnly && (
          <div className="glass rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Discount</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ["none", "None", null],
                ["military", "Military", ShieldCheck],
                ["code", "Discount Code", Ticket],
                ["manual", "Custom", null],
              ] as const)
                // Hidden for new bookings while the program is off in Settings.
                .filter(([key]) => key !== "military" || isEdit || settings.military.enabled || discountTab === "military")
                .map(([key, label, Icon]) => (
                <button key={key} type="button"
                  onClick={() => { setDiscountTab(key); setCodeError(""); touch(); }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all border flex items-center justify-center gap-1.5 ${
                    discountTab === key
                      ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                      : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#FCC300]/50 hover:text-white"
                  }`}>
                  {Icon && <Icon className="w-4 h-4" />}{label}
                </button>
              ))}
            </div>

            {discountTab === "military" && (
              <p className="text-[#A1A1AA] text-sm">
                {dollars(rates.militaryAmount)} off the whole booking for active-duty or retired military.
                Check their military ID in person — no upload needed.
              </p>
            )}

            {discountTab === "code" && (
              discount.kind === "code" ? (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  <span className="text-green-400 text-sm">
                    Code <span className="font-mono">{discount.code}</span> — {codeLabel({ type: discount.type, value: discount.value })}
                  </span>
                  <button type="button" aria-label="Remove code" className="text-[#A1A1AA] hover:text-white"
                    onClick={() => { setDiscount({ kind: "none" }); setCodeInput(""); touch(); }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={codeInput} placeholder="Enter code" className={`${inputCls} uppercase`}
                      onChange={(e) => setCodeInput(e.target.value)} />
                    <Button type="button" disabled={codeBusy || !codeInput.trim()} onClick={applyCode}
                      className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-10 rounded-xl">
                      {codeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                  {codeError && <p className="text-red-400 text-xs">{codeError}</p>}
                  <p className="text-[#A1A1AA] text-xs">One-time codes are used up when the booking is saved.</p>
                </div>
              )
            )}

            {discountTab === "manual" && (
              <div className="flex gap-2 max-w-xs">
                <div className="flex rounded-xl border border-white/10 overflow-hidden flex-shrink-0">
                  {([["amount", "$"], ["percent", "%"]] as const).map(([key, label]) => (
                    <button key={key} type="button"
                      onClick={() => { setManualType(key); setManualValue(""); touch(); }}
                      className={`w-10 h-10 text-sm font-semibold transition-colors ${
                        manualType === key ? "bg-[#FCC300] text-[#0A0A0A]" : "bg-white/5 text-[#A1A1AA] hover:text-white"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <Input type="number" min={0} step={manualType === "percent" ? 1 : 0.01} value={manualValue} placeholder="0"
                  max={manualType === "percent" ? 100 : price.subtotalCents / 100}
                  onChange={(e) => { setManualValue(e.target.value); touch(); }} className={inputCls} />
              </div>
            )}
          </div>
        )}

        {/* Terms (new bookings) */}
        {!isEdit && (
          <label className="glass rounded-2xl p-5 flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#FCC300] flex-shrink-0" />
            <span className="text-white text-sm">
              The customer agreed to Volt&apos;s{" "}
              <a href="/terms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>{" "}
              (verbally, in person or over the phone).
            </span>
          </label>
        )}

        {/* Text opt-in (new bookings) — optional, never required to book */}
        {!isEdit && (
          <label className="glass rounded-2xl p-5 flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#FCC300] flex-shrink-0" />
            <span className="text-white text-sm">
              The customer said <strong>yes</strong> when asked: &ldquo;May we text you about this booking?&rdquo;
              <span className="text-[#A1A1AA] text-xs block mt-1">
                Optional. Confirmations, changes and trip reminders. Message frequency varies; msg &amp; data rates
                may apply; reply STOP to opt out, HELP for help. Leave unticked if they said no or weren&apos;t asked —
                they&apos;ll get emails only.
              </span>
            </span>
          </label>
        )}
      </fieldset>

      {/* Price + payment */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">{isEdit ? "Price & Payment" : "Payment"}</h2>

        <div className="bg-white/3 rounded-xl p-4 space-y-1.5">
          {lines.map(([label, cents]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">{label}{search.roundTrip ? " · round trip" : ""}</span>
              <span className="text-white">{formatCents(cents)}</span>
            </div>
          ))}
          {price.discountCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">{isComp ? "Complimentary" : discountLabel}</span>
              <span className="text-green-400">−{formatCents(price.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-1">
            <span className="text-white">{isEdit ? "New total" : "Total"}</span>
            <span className="text-[#FCC300] text-lg">{formatCents(price.totalCents)}</span>
          </div>
          {isEdit && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#A1A1AA]">Current total</span>
                <span className="text-white">{formatCents(oldTotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-white">{priceChange > 0 ? "Customer pays" : priceChange < 0 ? "Price goes down by" : "Price change"}</span>
                <span className={priceChange > 0 ? "text-[#FCC300]" : priceChange < 0 ? "text-green-400" : "text-white"}>
                  {priceChange === 0 ? "None" : formatCents(Math.abs(priceChange))}
                </span>
              </div>
            </>
          )}
        </div>

        {isEdit && priceChange < 0 && (
          <p className="text-[#A1A1AA] text-sm">
            After you update, the reservation page shows the refund owed. Nothing is refunded until you press
            <span className="text-white"> Refund</span> there.
          </p>
        )}

        {(!isEdit || priceChange > 0) && (
          <>
            {isEdit && <p className="text-[#A1A1AA] text-sm">The extra charge must be paid before the change is made.</p>}
            <div className={`grid gap-2 ${isEdit ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
              {([
                ["cash", "Cash", Banknote],
                ["stripe", "Card", CreditCard],
                ["split", "Split", SplitSquareHorizontal],
                ...(isEdit ? [] : [["comp", "Comp (Free)", Gift]] as const),
              ] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" disabled={locked || saving}
                  onClick={() => { setPayMethod(key as PayMethod); touch(); }}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
                    payMethod === key
                      ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                      : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#FCC300]/50 hover:text-white"
                  } disabled:opacity-60 disabled:cursor-not-allowed`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>

            {!isComp && due > 0 && (
              <fieldset disabled={locked || saving}>
                {payMethod === "split" ? (
                  <div className="max-w-xs">
                    <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Cash received ($) — the rest goes on the card</Label>
                    <Input type="number" min={0} step="0.01" max={due / 100} value={splitCash} placeholder="0.00"
                      onChange={(e) => setSplitCash(e.target.value)} className={inputCls} />
                    <p className="text-[#A1A1AA] text-xs mt-1.5">
                      Cash {formatCents(Math.max(0, splitCashCents))} · Card {formatCents(Math.max(0, cardCents))}
                    </p>
                  </div>
                ) : !isEdit ? (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} className="w-4 h-4 accent-[#FCC300]" />
                    <span className="text-white text-sm">
                      {payMethod === "stripe" ? "Charge card now (uncheck to collect later)" : "Payment collected (cash received)"}
                    </span>
                  </label>
                ) : payMethod === "cash" ? (
                  <p className="text-[#A1A1AA] text-sm">Collect {formatCents(due)} cash before pressing Update.</p>
                ) : null}
              </fieldset>
            )}

            {chargeCardNow && <StaffCardPayment ref={cardRef} amountCents={cardCents} />}
          </>
        )}
      </div>

      {/* Edit review */}
      {isEdit && quote && (
        <div className="glass rounded-2xl p-6 space-y-3 border border-[#FCC300]/30">
          <h2 className="text-white font-semibold">Review changes</h2>
          <ul className="space-y-1.5">
            {quote.summary.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-white">
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#FCC300] mt-0.5 flex-shrink-0" />{line}
              </li>
            ))}
          </ul>
          {quote.priceChangeCents < 0 && quote.refundDueAfterCents > 0 && (
            <p className="text-green-400 text-sm">The customer will be owed {formatCents(quote.refundDueAfterCents)} back.</p>
          )}
          <p className="text-[#A1A1AA] text-xs">The customer gets a text with the updated details.</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isEdit ? (
        quote || pendingCard ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" disabled={saving} onClick={applyEdit}
              className="flex-1 bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-12 rounded-xl disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</>
                : pendingCard ? <><CreditCard className="w-4 h-4 mr-2" />Retry Card · {formatCents(cardCents)}</>
                : <><CheckCircle2 className="w-4 h-4 mr-2" />
                    {due > 0 ? `${chargeCardNow ? `Charge ${formatCents(cardCents)} & ` : ""}Update Reservation` : "Update Reservation"}
                  </>}
            </Button>
            {!pendingCard && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => setQuote(null)}
                className="border-white/15 text-white hover:bg-white/5 h-12 rounded-xl">
                Keep editing
              </Button>
            )}
          </div>
        ) : (
          <Button type="button" disabled={saving} onClick={reviewEdit}
            className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-12 rounded-xl disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking…</> : "Review Changes"}
          </Button>
        )
      ) : (
        <Button type="button" disabled={saving} onClick={submitNew}
          className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-12 rounded-xl disabled:opacity-60">
          {saving
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{pendingCard ? "Charging card…" : "Creating reservation…"}</>
            : pendingCard
            ? <><CreditCard className="w-4 h-4 mr-2" />Retry Card · {formatCents(cardCents)}</>
            : <><CheckCircle2 className="w-4 h-4 mr-2" />{chargeCardNow ? `Create Reservation & Charge ${formatCents(cardCents)}` : "Create Reservation"}</>}
        </Button>
      )}
      {pendingCard && (
        <Link href={`/dashboard/reservations/${pendingCard.reservationId}`} className="block text-center text-[#A1A1AA] hover:text-white text-sm transition-colors">
          {pendingCard.changeId ? "Cancel — leave the reservation unchanged →" : `Charge the card later — open reservation ${pendingCard.label} →`}
        </Link>
      )}
    </div>
  );
}

function LegCard({ title, from, to, slot, flight }: {
  title: string; from: keyof typeof LOCATIONS; to: keyof typeof LOCATIONS; slot: DepartureSlot; flight: string;
}) {
  return (
    <div className="bg-white/3 rounded-xl p-3">
      <div className="text-[#A1A1AA] text-xs uppercase tracking-wider">{title}</div>
      <div className="text-white text-sm font-medium mt-0.5">
        {LOCATIONS[from].label} → {LOCATIONS[to].label}
      </div>
      <div className="text-[#A1A1AA] text-sm">{formatDate(slot.date ?? "")} · {slotTimes(slot, to)}</div>
      {flight && (
        <div className="text-[#A1A1AA] text-xs mt-1 flex items-center gap-1.5">
          <Plane className="w-3 h-3 text-[#FCC300]" />{flight}
        </div>
      )}
    </div>
  );
}

// Return-leg-only search: same flight-or-date choice the rider made, for the
// trip home only.
function ReturnLegSearch({ search, onBack, onSearch }: {
  search: BookingSearch;
  onBack: () => void;
  onSearch: (date: string, flight: FlightInfo) => void;
}) {
  const [date, setDate] = useState(search.returnDate);
  const [flight, setFlight] = useState<FlightInfo>(search.returnFlight);
  const [error, setError] = useState("");
  const today = localDateString();

  const submit = () => {
    if (search.hasFlight) {
      if (!flight.date || !flight.time || !flight.airline.trim() || !flight.flightNumber.trim() || !flight.terminal) {
        setError("Fill in every return flight detail, including the ATL terminal.");
        return;
      }
      onSearch(flight.date, flight);
    } else {
      if (!date) { setError("Pick the return date."); return; }
      onSearch(date, { ...EMPTY_FLIGHT });
    }
  };

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-white text-2xl font-bold mb-1">Change Return Trip</h2>
        <p className="text-[#A1A1AA] text-sm">
          {LOCATIONS[search.to].label} → {LOCATIONS[search.from].label}
        </p>
      </div>
      {search.hasFlight ? (
        <FlightFields
          title="Return Flight"
          direction={flightDirection(search.to)}
          flight={flight}
          minDate={today}
          onChange={setFlight}
        />
      ) : (
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Return Date</Label>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] [color-scheme:dark]"
          />
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button type="button" onClick={submit}
          className="flex-1 bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-12 rounded-xl">
          Find Return Departures
        </Button>
        <Button type="button" variant="outline" onClick={onBack}
          className="border-white/15 text-white hover:bg-white/5 h-12 rounded-xl">
          Keep the current return
        </Button>
      </div>
    </div>
  );
}
