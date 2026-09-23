"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Users, ArrowLeft, Loader2, Plane, AlertTriangle } from "lucide-react";
import {
  type BookingSearch,
  type DepartureSlot,
  type FlightInfo,
  type FlightDirection,
  type FlightMatch,
  type FlightTimingSettings,
  type LocationKey,
  DEFAULT_FLIGHT_TIMING,
  candidateDatesForFlight,
  displayTime12h,
  flightDirection,
  formatDate,
  formatDuration,
  matchDeparturesToFlight,
  LOCATIONS,
} from "@/lib/booking";
import { formatDateShort, localDateString } from "@/lib/format";
import PriceSummary from "./PriceSummary";

interface Props {
  search: BookingSearch;
  onNext: (outbound: DepartureSlot, returnSlot: DepartureSlot | null) => void;
  onBack: () => void;
}

async function fetchDay(
  from: string, to: string, date: string,
): Promise<{ slots: DepartureSlot[]; timing: FlightTimingSettings }> {
  const res = await fetch(`/api/trips/availability?route_key=${from}-${to}&date=${date}`);
  if (!res.ok) return { slots: [], timing: DEFAULT_FLIGHT_TIMING };
  const data = await res.json();
  return { slots: data.slots ?? [], timing: data.timing ?? DEFAULT_FLIGHT_TIMING };
}

async function fetchSlots(from: string, to: string, date: string): Promise<DepartureSlot[]> {
  return (await fetchDay(from, to, date)).slots;
}

export interface FlightLeg {
  flight: FlightInfo;
  direction: FlightDirection;
  timing: FlightTimingSettings;
  matches: FlightMatch[];
}

// Loads every departure that could fit the flight — including the day before/
// after when the fit window crosses midnight — and keeps the ones that fit.
async function fetchFlightLeg(from: LocationKey, to: LocationKey, flight: FlightInfo): Promise<FlightLeg> {
  const direction = flightDirection(from);
  const first = await fetchDay(from, to, flight.date);
  const timing = first.timing;
  const otherDates = candidateDatesForFlight(flight, direction, timing).filter((d) => d !== flight.date);
  const others = await Promise.all(otherDates.map((d) => fetchSlots(from, to, d)));

  // Never offer a departure that has already left.
  const now = new Date();
  const nowKey = `${localDateString(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const matches = matchDeparturesToFlight([...first.slots, ...others.flat()], flight, direction, timing)
    .filter((m) => `${m.departsAt.date}T${m.departsAt.time}` > nowKey);

  return { flight, direction, timing, matches };
}

export default function Step2Departures({ search, onNext, onBack }: Props) {
  const [selectedOutbound, setSelectedOutbound] = useState<DepartureSlot | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<DepartureSlot | null>(null);

  const [outboundSlots, setOutboundSlots] = useState<DepartureSlot[]>([]);
  const [returnSlots, setReturnSlots] = useState<DepartureSlot[]>([]);
  const [outboundLeg, setOutboundLeg] = useState<FlightLeg | null>(null);
  const [returnLeg, setReturnLeg] = useState<FlightLeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSelectedOutbound(null);
    setSelectedReturn(null);

    if (search.hasFlight) {
      Promise.all([
        fetchFlightLeg(search.from, search.to, search.outboundFlight),
        search.roundTrip ? fetchFlightLeg(search.to, search.from, search.returnFlight) : Promise.resolve(null),
      ])
        .then(([out, ret]) => {
          if (cancelled) return;
          setOutboundLeg(out);
          setReturnLeg(ret);
        })
        .catch(() => { if (!cancelled) setLoadError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    Promise.all([
      fetchSlots(search.from, search.to, search.date),
      search.roundTrip && search.returnDate
        ? fetchSlots(search.to, search.from, search.returnDate)
        : Promise.resolve([]),
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
  }, [search]);

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
            {LOCATIONS[search.from].label} → {LOCATIONS[search.to].label} ·{" "}
            {search.hasFlight ? "Matched to your flight" : formatDate(search.date)}
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
      ) : search.hasFlight && outboundLeg ? (
        <>
          <FlightOptions
            leg={outboundLeg}
            from={search.from}
            to={search.to}
            label={search.roundTrip ? "Outbound" : "Your Ride"}
            selected={selectedOutbound}
            onSelect={setSelectedOutbound}
          />
          {search.roundTrip && returnLeg && (
            <FlightOptions
              leg={returnLeg}
              from={search.to}
              to={search.from}
              label="Return"
              selected={selectedReturn}
              onSelect={setSelectedReturn}
            />
          )}
        </>
      ) : (
        <>
          <DepartureGrid
            slots={outboundSlots}
            selected={selectedOutbound}
            onSelect={setSelectedOutbound}
            label={`Outbound — ${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short} · ${formatDate(search.date)}`}
          />

          {search.roundTrip && (
            <DepartureGrid
              slots={returnSlots}
              selected={selectedReturn}
              onSelect={setSelectedReturn}
              label={`Return — ${LOCATIONS[search.to].short} → ${LOCATIONS[search.from].short} · ${formatDate(search.returnDate)}`}
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

// ── Flight-matched departure list ─────────────────────────────────────────────
function FlightOptions({
  leg, from, to, label, selected, onSelect,
}: {
  leg: FlightLeg;
  from: LocationKey;
  to: LocationKey;
  label: string;
  selected: DepartureSlot | null;
  onSelect: (s: DepartureSlot) => void;
}) {
  const { flight, direction, timing, matches } = leg;
  const departing = direction === "departing";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-white font-semibold">
          {label} — {LOCATIONS[from].short} → {LOCATIONS[to].short}
        </h3>
        <p className="text-[#A1A1AA] text-xs mt-1 flex items-center gap-1.5 flex-wrap">
          <Plane className="w-3 h-3" />
          {flight.airline} {flight.flightNumber} {departing ? "departs" : "lands"}{" "}
          {displayTime12h(flight.time)} · {formatDate(flight.date)} · {flight.terminal}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="glass rounded-xl p-6 text-center">
          <p className="text-white font-medium text-sm mb-1">No Volt departures fit this flight</p>
          <p className="text-[#A1A1AA] text-xs">
            Double-check your flight time, or call us and we&apos;ll work something out.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => {
            const isSelected = selected?.id === m.slot.id;
            const full = !m.slot.available;
            const otherDay = m.departsAt.date !== flight.date;
            return (
              <button
                key={m.slot.id}
                type="button"
                disabled={full}
                onClick={() => onSelect(m.slot)}
                className={`w-full text-left rounded-xl p-3 sm:p-4 border transition-all flex items-center gap-3 ${
                  isSelected
                    ? "bg-[#7C3AED]/20 border-[#7C3AED]"
                    : full
                    ? "bg-white/3 border-white/5 opacity-40 cursor-not-allowed"
                    : "glass border-white/10 hover:border-[#7C3AED]/50 hover:bg-[#7C3AED]/10"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? "border-[#7C3AED] bg-[#7C3AED] ring-2 ring-inset ring-[#0A0A0A]" : "border-white/30"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-white font-semibold">{m.slot.displayTime}</span>
                    {otherDay && (
                      <span className="text-[#A1A1AA] text-xs">{formatDateShort(m.departsAt.date)}</span>
                    )}
                    <span className="text-[#A1A1AA] text-xs">
                      {departing ? "→ arrives ATL" : "→ arrives Columbus"} ~{displayTime12h(m.arrivesAt.time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-medium ${m.tight ? "text-amber-400" : "text-[#C4B5FD]"}`}>
                      {departing
                        ? `${formatDuration(m.gapMinutes)} before your flight`
                        : `${formatDuration(m.gapMinutes)} after you land`}
                    </span>
                    {m.tight && (
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        <AlertTriangle className="w-2.5 h-2.5" /> Tight
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {full ? (
                    <span className="text-xs text-[#A1A1AA]">Full</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-[#A1A1AA]">
                      <Users className="w-3 h-3" /> {m.slot.seatsLeft} left
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[#A1A1AA] text-xs">
        Arrival times use Volt&apos;s {formatDuration(timing.routeMinutes)} scheduled route time.{" "}
        {departing
          ? "TSA recommends arriving 2 hrs before domestic and 3 hrs before international flights."
          : "Leave time to deplane and collect checked bags."}
      </p>
    </div>
  );
}
