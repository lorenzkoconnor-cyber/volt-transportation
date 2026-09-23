"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Users, ArrowLeft, Loader2, Plane, AlertTriangle, Timer } from "lucide-react";
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
  shiftDate,
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

// "2026-10-02T14:05" for now, comparable with a slot's date + time.
function nowKey(): string {
  const now = new Date();
  return `${localDateString(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// Without a flight, riders choose the time at the airport: when to arrive at
// ATL (heading there) or when to be picked up at ATL (heading home). For the
// ATL-bound leg `date` is the arrival date, so the evening before is loaded too
// — a late departure can reach ATL after midnight.
async function fetchAirportLeg(
  from: LocationKey, to: LocationKey, date: string,
): Promise<{ slots: DepartureSlot[]; timing: FlightTimingSettings }> {
  const toAirport = to === "atl";
  const days = await Promise.all(
    (toAirport ? [shiftDate(date, -1), date] : [date]).map((d) => fetchDay(from, to, d)),
  );
  const now = nowKey();
  const slots = days
    .flatMap((d) => d.slots)
    .filter((s) => !toAirport || (s.arrivalDate ?? s.date) === date)
    .filter((s) => `${s.date}T${s.time}` > now);
  return { slots, timing: days[days.length - 1].timing };
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
  const now = nowKey();
  const matches = matchDeparturesToFlight([...first.slots, ...others.flat()], flight, direction, timing)
    .filter((m) => `${m.departsAt.date}T${m.departsAt.time}` > now);

  return { flight, direction, timing, matches };
}

interface LoadedDepartures {
  search: BookingSearch;
  error?: boolean;
  outboundSlots?: DepartureSlot[];
  returnSlots?: DepartureSlot[];
  outboundLeg?: FlightLeg | null;
  returnLeg?: FlightLeg | null;
  routeMinutes?: number;
}

export default function Step2Departures({ search, onNext, onBack }: Props) {
  const [selectedOutbound, setSelectedOutbound] = useState<DepartureSlot | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<DepartureSlot | null>(null);

  // Everything loaded for one search. `loading` is derived — a result for an
  // older search just means the new one is still on its way.
  const [loaded, setLoaded] = useState<LoadedDepartures | null>(null);
  const loading = loaded?.search !== search;
  const {
    error: loadError = false,
    outboundSlots = [],
    returnSlots = [],
    outboundLeg = null,
    returnLeg = null,
    routeMinutes = DEFAULT_FLIGHT_TIMING.routeMinutes,
  } = loading ? {} : loaded;

  useEffect(() => {
    let cancelled = false;
    const finish = (result: Omit<LoadedDepartures, "search">) => {
      if (cancelled) return;
      setSelectedOutbound(null);
      setSelectedReturn(null);
      setLoaded({ search, ...result });
    };
    const fail = () => finish({ error: true });

    if (search.hasFlight) {
      Promise.all([
        fetchFlightLeg(search.from, search.to, search.outboundFlight),
        search.roundTrip ? fetchFlightLeg(search.to, search.from, search.returnFlight) : Promise.resolve(null),
      ])
        .then(([out, ret]) => finish({ outboundLeg: out, returnLeg: ret }))
        .catch(fail);
    } else {
      Promise.all([
        fetchAirportLeg(search.from, search.to, search.date),
        search.roundTrip && search.returnDate
          ? fetchAirportLeg(search.to, search.from, search.returnDate)
          : Promise.resolve(null),
      ])
        .then(([out, ret]) =>
          finish({
            error: out.slots.length === 0,
            outboundSlots: out.slots,
            returnSlots: ret?.slots ?? [],
            routeMinutes: out.timing.routeMinutes,
          }),
        )
        .catch(fail);
    }

    return () => { cancelled = true; };
  }, [search]);

  const canProceed =
    selectedOutbound !== null && (!search.roundTrip || selectedReturn !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">
            {search.hasFlight ? "Choose Your Departure" : "Choose Your Airport Time"}
          </h2>
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
          <div className="glass rounded-xl p-4 flex items-start gap-3 border border-[#7C3AED]/30">
            <Timer className="w-5 h-5 text-[#C4B5FD] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm font-semibold">
                Estimated travel time: {formatDuration(routeMinutes, true)} each way
              </p>
              <p className="text-[#A1A1AA] text-xs mt-1">
                That&apos;s our drive between Volt in Columbus and ATL, to and from the airport. So you
                pick the time that matters — when you reach the airport, or when we pick you up there —
                and we work out the rest.
              </p>
            </div>
          </div>

          <DepartureGrid
            slots={outboundSlots}
            selected={selectedOutbound}
            onSelect={setSelectedOutbound}
            to={search.to}
            date={search.date}
            label={`${search.roundTrip ? "Outbound" : "Your Ride"} — ${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short} · ${formatDate(search.date)}`}
          />

          {search.roundTrip && (
            <DepartureGrid
              slots={returnSlots}
              selected={selectedReturn}
              onSelect={setSelectedReturn}
              to={search.from}
              date={search.returnDate}
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

// ── Airport-time departure grid (no flight) ──────────────────────────────────
// Each card leads with the airport-side time: arrival at ATL when heading
// there, pickup at ATL when heading home. The other end is shown beneath.
function DepartureGrid({
  slots,
  selected,
  onSelect,
  label,
  to,
  date,
}: {
  slots: DepartureSlot[];
  selected: DepartureSlot | null;
  onSelect: (s: DepartureSlot) => void;
  label: string;
  to: LocationKey;
  date: string;
}) {
  const toAirport = to === "atl";
  return (
    <div>
      <h3 className="text-white font-semibold">{label}</h3>
      <p className="text-[#A1A1AA] text-xs mt-1 mb-3">
        {toAirport
          ? "Choose when you'd like to arrive at ATL — we'll show when your shuttle leaves Volt."
          : "Choose when you'd like to be picked up at ATL — we'll estimate your arrival in Columbus."}
      </p>
      {slots.length === 0 ? (
        <div className="glass rounded-xl p-6 text-center">
          <p className="text-white font-medium text-sm">No departures available for this date</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {slots.map((slot) => {
            const isSelected = selected?.id === slot.id;
            const primary = toAirport ? slot.arrivalDisplayTime ?? slot.displayTime : slot.displayTime;
            const secondary = toAirport
              ? { label: "Leaves Volt", time: `${slot.displayTime}${slot.date && slot.date !== date ? ` · ${formatDateShort(slot.date)}` : ""}` }
              : slot.arrivalDisplayTime
              ? { label: "Arrives Columbus", time: `~${slot.arrivalDisplayTime}` }
              : null;
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
                <div className="flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3 opacity-70" />
                  <span className="text-sm font-semibold">{toAirport && slot.arrivalDisplayTime ? "~" : ""}{primary}</span>
                </div>
                {secondary && (
                  <div className="text-[11px] leading-tight opacity-70 my-1">
                    <div>{secondary.label}</div>
                    <div className="whitespace-nowrap">{secondary.time}</div>
                  </div>
                )}
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
      )}
    </div>
  );
}
