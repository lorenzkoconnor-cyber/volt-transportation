"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, User, Plus, X } from "lucide-react";
import { type BookingSearch, type Passenger, LOCATIONS, formatDate } from "@/lib/booking";
import type { DepartureSlot } from "@/lib/booking";
import PriceSummary from "./PriceSummary";

interface Props {
  search: BookingSearch;
  outbound: DepartureSlot;
  onNext: (primary: Passenger, additional: string[], notes: string) => void;
  onBack: () => void;
}

export default function Step3Passengers({ search, outbound, onNext, onBack }: Props) {
  const [primary, setPrimary] = useState<Passenger>({ name: "", phone: "", email: "" });
  const [additional, setAdditional] = useState<string[]>(
    Array(Math.max(0, search.adults + search.children - 1)).fill("")
  );
  const [notes, setNotes] = useState("");

  const totalPassengers = search.adults + search.children;

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
            {LOCATIONS[search.from].label} → {LOCATIONS[search.to].label} · {outbound.displayTime} · {formatDate(search.date)}
          </p>
        </div>
        <button type="button" onClick={onBack} className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Primary passenger */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0">
            <User className="w-3 h-3 text-white" />
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
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
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
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
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
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
          />
          <p className="text-[#A1A1AA] text-xs mt-1.5">Confirmation sent here and by SMS</p>
        </div>
      </div>

      {/* Additional passengers */}
      {totalPassengers > 1 && (
        <div className="glass rounded-2xl p-6 space-y-3">
          <h3 className="text-white font-semibold mb-1">
            Additional Passengers
            <span className="text-[#A1A1AA] text-xs font-normal ml-2">(optional — names for manifest)</span>
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
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
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
              className="flex items-center gap-2 text-[#7C3AED] hover:text-[#9D5FF5] text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Add passenger name
            </button>
          )}
        </div>
      )}

      {/* Special requests */}
      <div>
        <Label className="text-[#A1A1AA] text-xs mb-2 block">Special Requests / Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special requests, accessibility needs, or notes for your driver..."
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#7C3AED] resize-none"
        />
      </div>

      <PriceSummary search={search} />

      <Button
        type="submit"
        size="lg"
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl group"
      >
        Continue to Payment
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </form>
  );
}
