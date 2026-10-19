"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, User, Plus, X } from "lucide-react";
import { type BookingSearch, type Passenger, LOCATIONS, MOBILITY_NOTE, formatDate, slotTimes } from "@/lib/booking";
import type { DepartureSlot } from "@/lib/booking";
import PriceSummary from "./PriceSummary";

interface Props {
  search: BookingSearch;
  outbound: DepartureSlot;
  // What the rider entered on an earlier visit to this step.
  initialPrimary: Passenger;
  initialAdditional: string[];
  initialNotes: string;
  onChange?: (primary: Passenger, additional: string[], notes: string) => void;
  onNext: (primary: Passenger, additional: string[], notes: string) => void;
  onBack: () => void;
}

export default function Step3Passengers({
  search, outbound, initialPrimary, initialAdditional, initialNotes, onChange, onNext, onBack,
}: Props) {
  const totalPassengers = search.adults + search.children;

  const [primary, setPrimary] = useState<Passenger>(initialPrimary);
  // Saved names are kept, trimmed if the passenger count went down since.
  const [additional, setAdditional] = useState<string[]>(() =>
    initialAdditional.length
      ? initialAdditional.slice(0, Math.max(0, totalPassengers - 1))
      : Array(Math.max(0, totalPassengers - 1)).fill("")
  );
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    onChange?.(primary, additional, notes);
  }, [primary, additional, notes, onChange]);

  // Mobility assistance lives in the notes so it reaches the driver's manifest.
  const needsMobility = notes.includes(MOBILITY_NOTE);
  const toggleMobility = (on: boolean) =>
    setNotes((prev) => {
      const rest = prev.split("\n").filter((l) => l.trim() !== MOBILITY_NOTE).join("\n").trim();
      return on ? [MOBILITY_NOTE, rest].filter(Boolean).join("\n") : rest;
    });
  const visibleNotes = notes.split("\n").filter((l) => l.trim() !== MOBILITY_NOTE).join("\n");

  const setPrimaryField = (field: keyof Passenger, value: string) =>
    setPrimary((prev) => ({ ...prev, [field]: value }));

  const setAdditionalName = (index: number, value: string) => {
    const next = [...additional];
    next[index] = value;
    setAdditional(next);
  };

  const addPassenger = () => setAdditional((prev) => [...prev, ""]);
  const removePassenger = (index: number) =>
    setAdditional((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(primary, additional, notes);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">Passenger Information</h2>
          <p className="text-[#A1A1AA] text-sm">
            {LOCATIONS[search.from].label} → {LOCATIONS[search.to].label} · {slotTimes(outbound, search.to)} · {formatDate(outbound.date || search.date)}
          </p>
        </div>
        <button type="button" onClick={onBack} className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Primary passenger */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-[#FCC300] flex items-center justify-center flex-shrink-0">
            <User className="w-3 h-3 text-[#0A0A0A]" />
          </div>
          <h3 className="text-white font-semibold">Primary Passenger</h3>
          <span className="text-[#A1A1AA] text-xs">(booking contact)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">Full Name *</Label>
            <Input
              required
              value={primary.name}
              onChange={(e) => setPrimaryField("name", e.target.value)}
              placeholder="John Smith"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#FCC300]"
            />
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">Phone Number *</Label>
            <Input
              required
              type="tel"
              value={primary.phone}
              onChange={(e) => setPrimaryField("phone", e.target.value)}
              placeholder="(706) 555-0000"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#FCC300]"
            />
          </div>
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Email Address *</Label>
          <Input
            required
            type="email"
            value={primary.email}
            onChange={(e) => setPrimaryField("email", e.target.value)}
            placeholder="you@email.com"
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#FCC300]"
          />
          <p className="text-[#A1A1AA] text-xs mt-1.5">Your confirmation and receipt are emailed here</p>
        </div>

        {/* Text-message opt-in — optional; booking works without it (10DLC rules). */}
        <label htmlFor="sms-consent" className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/10 p-4 cursor-pointer">
          <input
            id="sms-consent"
            type="checkbox"
            checked={!!primary.smsConsent}
            onChange={(e) => setPrimary((prev) => ({ ...prev, smsConsent: e.target.checked }))}
            className="mt-0.5 accent-[#FCC300] w-4 h-4 flex-shrink-0"
          />
          <span>
            <span className="text-white text-sm font-medium block">Text me about this booking (optional)</span>
            <span className="text-[#A1A1AA] text-xs leading-relaxed block mt-1">
              By checking this box, I agree to receive text messages from Volt Transportation at the phone number
              above about my reservation, including booking confirmations, trip reminders, and pickup or schedule
              updates. Consent is not a condition of purchase. Message frequency varies. Message and data rates may
              apply. Reply STOP to opt out at any time or HELP for help. See our{" "}
              <a href="/privacy-policy" target="_blank" className="text-[#FCC300] hover:underline">Privacy Policy</a>
              {" "}and{" "}
              <a href="/terms#sms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>.
            </span>
          </span>
        </label>
      </div>

      {/* Additional passengers */}
      {totalPassengers > 1 && (
        <div className="glass rounded-2xl p-6 space-y-3">
          <h3 className="text-white font-semibold mb-1">
            Additional Passengers
            <span className="text-[#A1A1AA] text-xs font-normal ml-2">(optional — names for the boarding list)</span>
          </h3>
          {additional.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-[#A1A1AA] text-xs">
                {i + 2}
              </div>
              <Input
                value={name}
                onChange={(e) => setAdditionalName(i, e.target.value)}
                placeholder={`Passenger ${i + 2} name`}
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#FCC300]"
              />
              <button
                type="button"
                onClick={() => removePassenger(i)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {additional.length < totalPassengers - 1 && (
            <button
              type="button"
              onClick={addPassenger}
              className="flex items-center gap-2 text-[#FCC300] hover:text-[#FFD54A] text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Add passenger name
            </button>
          )}
        </div>
      )}

      {/* Mobility assistance */}
      <label className="flex items-start gap-3 glass rounded-xl p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={needsMobility}
          onChange={(e) => toggleMobility(e.target.checked)}
          className="mt-1 accent-[#FCC300] w-4 h-4"
        />
        <span>
          <span className="text-white text-sm font-medium block">I need mobility assistance</span>
          <span className="text-[#A1A1AA] text-xs block mt-0.5">
            Bringing a folding wheelchair or walker, or need help boarding. Our vans don&apos;t have a lift, so riders
            need to be able to move into a seat; your driver will help and stow the chair at no charge.{" "}
            <a href="/safety-rules#accessibility" target="_blank" className="text-[#FCC300] hover:underline">Accessibility details</a>
          </span>
        </span>
      </label>

      {/* Special requests */}
      <div>
        <Label className="text-[#A1A1AA] text-xs mb-2 block">Special Requests / Notes (optional)</Label>
        <Textarea
          value={visibleNotes}
          onChange={(e) => setNotes(needsMobility ? [MOBILITY_NOTE, e.target.value].filter(Boolean).join("\n") : e.target.value)}
          placeholder="Any special requests, accessibility needs, or notes for your driver..."
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#FCC300] resize-none"
        />
      </div>

      <PriceSummary search={search} />

      <Button
        type="submit"
        size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-12 rounded-xl group"
      >
        Continue to Payment
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </form>
  );
}
