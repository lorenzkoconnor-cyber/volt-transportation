"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Users, ArrowLeft } from "lucide-react";
import {
  type BookingSearch,
  type DepartureSlot,
  generateDepartureSlots,
  formatDate,
  LOCATIONS,
} from "@/lib/booking";
import PriceSummary from "./PriceSummary";

interface Props {
  search: BookingSearch;
  onNext: (outbound: DepartureSlot, returnSlot: DepartureSlot | null) => void;
  onBack: () => void;
}

export default function Step2Departures({ search, onNext, onBack }: Props) {
  const [selectedOutbound, setSelectedOutbound] = useState<DepartureSlot | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<DepartureSlot | null>(null);

  const outboundSlots = useMemo(
    () => generateDepartureSlots(search.date, search.from),
    [search.date, search.from]
  );

  const returnSlots = useMemo(
    () => (search.roundTrip ? generateDepartureSlots(search.date, search.to) : []),
    [search.date, search.to, search.roundTrip]
  );

  const canProceed =
    selectedOutbound !== null && (!search.roundTrip || selectedReturn !== null);

  const DepartureGrid = ({
    slots,
    selected,
    onSelect,
    label,
  }: {
    slots: DepartureSlot[];
    selected: DepartureSlot | null;
    onSelect: (s: DepartureSlot) => void;
    label: string;
  }) => (
    <div>
      <h3 className="text-white font-semibold mb-3">{label}</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {slots.map((slot) => {
          const isSelected = selected?.id === slot.id;
          return (
            <button
              key={slot.id}
              disabled={!slot.available}
              onClick={() => onSelect(slot)}
              className={`relative rounded-xl p-3 text-center transition-all border ${
                isSelected
                  ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                  : slot.available
                  ? "glass border-white/10 text-white hover:border-[#7C3AED]/50 hover:bg-[#7C3AED]/10"
                  : "bg-white/3 border-white/5 text-[#A1A1AA]/40 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Clock className="w-3 h-3 opacity-70" />
                <span className="text-sm font-semibold">{slot.displayTime}</span>
              </div>
              {slot.available ? (
                <div className="flex items-center justify-center gap-0.5">
                  <Users className="w-2.5 h-2.5 opacity-60" />
                  <span className="text-xs opacity-70">{slot.seatsLeft} left</span>
                </div>
              ) : (
                <span className="text-xs opacity-50">Full</span>
              )}
              {isSelected && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">Choose Your Departure</h2>
          <p className="text-[#A1A1AA] text-sm">
            {LOCATIONS[search.from].label} → {LOCATIONS[search.to].label} · {formatDate(search.date)}
          </p>
        </div>
        <button onClick={onBack} className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Edit
        </button>
      </div>

      <DepartureGrid
        slots={outboundSlots}
        selected={selectedOutbound}
        onSelect={setSelectedOutbound}
        label={`Outbound — ${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short}`}
      />

      {search.roundTrip && (
        <DepartureGrid
          slots={returnSlots}
          selected={selectedReturn}
          onSelect={setSelectedReturn}
          label={`Return — ${LOCATIONS[search.to].short} → ${LOCATIONS[search.from].short}`}
        />
      )}

      <PriceSummary search={search} />

      <Button
        disabled={!canProceed}
        onClick={() => canProceed && onNext(selectedOutbound!, selectedReturn)}
        size="lg"
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl disabled:opacity-40 group"
      >
        Continue to Passenger Info
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );
}
