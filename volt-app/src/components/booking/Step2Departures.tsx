"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Users, ArrowLeft, Loader2 } from "lucide-react";
import {
  type BookingSearch,
  type DepartureSlot,
  formatDate,
  LOCATIONS,
} from "@/lib/booking";
import PriceSummary from "./PriceSummary";

interface Props {
  search: BookingSearch;
  onNext: (outbound: DepartureSlot, returnSlot: DepartureSlot | null) => void;
  onBack: () => void;
}

async function fetchSlots(from: string, to: string, date: string): Promise<DepartureSlot[]> {
  const res = await fetch(`/api/trips/availability?route_key=${from}-${to}&date=${date}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.slots ?? [];
}

export default function Step2Departures({ search, onNext, onBack }: Props) {
  const [selectedOutbound, setSelectedOutbound] = useState<DepartureSlot | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<DepartureSlot | null>(null);

  const [outboundSlots, setOutboundSlots] = useState<DepartureSlot[]>([]);
  const [returnSlots, setReturnSlots] = useState<DepartureSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSelectedOutbound(null);
    setSelectedReturn(null);

    Promise.all([
      fetchSlots(search.from, search.to, search.date),
      search.roundTrip ? fetchSlots(search.to, search.from, search.date) : Promise.resolve([]),
    ])
      .then(([out, ret]) => {
        if (cancelled) return;
        setOutboundSlots(out);
        setReturnSlots(ret);
        if (out.length === 0) setLoadError(true);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [search.date, search.from, search.to, search.roundTrip]);

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

      {loading ? (
        <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Checking live availability…</p>
        </div>
      ) : loadError ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-white font-medium mb-1">No departures available for this date</p>
          <p className="text-[#A1A1AA] text-sm">Try a different date, or call us and we&apos;ll get you on the road.</p>
        </div>
      ) : (
        <>
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
        </>
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
