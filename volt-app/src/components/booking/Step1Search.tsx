"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { type BookingSearch, type FlightInfo, LOCATIONS, flightDirection } from "@/lib/booking";
import { earliestOnlineDate, localDateString, noticeWords } from "@/lib/format";
import { useAppSettings } from "@/context/SettingsContext";
import FlightFields from "./FlightFields";
import ChoiceSwitch from "./ChoiceSwitch";

const LOCATION_LABELS: Record<string, string> = {
  columbus: "Volt Columbus",
  atl: "Hartsfield-Jackson Airport",
};

interface Props {
  initial: BookingSearch;
  onChange?: (search: BookingSearch) => void;   // every edit, so a reload can restore it
  onNext: (search: BookingSearch) => void;
  staff?: boolean;   // Team Portal: staff can book inside the online cutoff
}

export default function Step1Search({ initial, onChange, onNext, staff = false }: Props) {
  const [search, setSearch] = useState<BookingSearch>(initial);
  const [error, setError] = useState("");
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Riders must pick each option; until they do the switch sits in the middle.
  const roundTripValue = staff || search.roundTripChosen ? search.roundTrip : null;
  const hasFlightValue = staff || search.hasFlightChosen ? search.hasFlight : null;

  useEffect(() => { onChange?.(search); }, [search, onChange]);

  const set = (key: keyof BookingSearch, value: string | number | boolean) =>
    setSearch((prev) => ({ ...prev, [key]: value }));

  const { onlineCutoffMinutes, business } = useAppSettings();
  const today = staff ? localDateString() : earliestOnlineDate(onlineCutoffMinutes);

  // Switching flight mode on/off carries the dates already chosen across
  // (travel dates ⇄ flight dates) so the rider doesn't re-enter them.
  const chooseFlight = (hasFlight: boolean) => {
    setError("");
    setSearch((prev) => ({
      ...prev,
      hasFlight,
      hasFlightChosen: true,
      date: prev.date || prev.outboundFlight.date,
      returnDate: prev.returnDate || (prev.roundTrip ? prev.returnFlight.date : ""),
      outboundFlight: { ...prev.outboundFlight, date: prev.outboundFlight.date || prev.date },
      returnFlight: { ...prev.returnFlight, date: prev.returnFlight.date || prev.returnDate },
    }));
  };

  const setFlight = (leg: "outboundFlight" | "returnFlight", flight: FlightInfo) =>
    setSearch((prev) => ({ ...prev, [leg]: flight }));

  const flightIncomplete = (f: FlightInfo) =>
    !f.date || !f.time || !f.airline.trim() || !f.flightNumber.trim() || !f.terminal;

  const chooseRoundTrip = (roundTrip: boolean) => {
    setError("");
    setSearch((prev) => ({
      ...prev,
      roundTrip,
      roundTripChosen: true,
      // clear a stale return date when switching back to one-way
      returnDate: roundTrip ? prev.returnDate : "",
    }));
  };

  const swapLocations = () =>
    setSearch((prev) => ({ ...prev, from: prev.to, to: prev.from }));

  const handleFrom = (v: string | null) => {
    if (!v) return;
    if (v === search.to) setSearch((prev) => ({ ...prev, from: v as "columbus" | "atl", to: prev.from as "columbus" | "atl" }));
    else set("from", v as "columbus" | "atl");
  };
  const handleTo = (v: string | null) => {
    if (!v) return;
    if (v === search.from) setSearch((prev) => ({ ...prev, to: v as "columbus" | "atl", from: prev.to as "columbus" | "atl" }));
    else set("to", v as "columbus" | "atl");
  };
  const handleAdults = (v: string | null) => { if (v) set("adults", Number(v)); };
  const handleChildren = (v: string | null) => { if (v !== null) set("children", Number(v)); };
  const handlePets = (v: string | null) => { if (v !== null) set("pets", Number(v)); };
  const handleBags = (v: string | null) => { if (v !== null) set("extraBags", Number(v)); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roundTripValue === null || hasFlightValue === null) {
      setTriedSubmit(true);
      setError(
        roundTripValue === null && hasFlightValue === null
          ? "Please choose One Way or Round Trip, and whether you have a flight."
          : roundTripValue === null
            ? "Please choose One Way or Round Trip."
            : "Please tell us whether you have a flight.",
      );
      return;
    }
    const travelDate = search.hasFlight ? search.outboundFlight.date : search.date;
    if (travelDate && travelDate < today) {
      setError(`Online bookings need at least ${noticeWords(onlineCutoffMinutes)} notice. To book a trip sooner, call Volt at ${business.phone} and speak with a manager.`);
      return;
    }
    if (search.hasFlight) {
      if (flightIncomplete(search.outboundFlight) || (search.roundTrip && flightIncomplete(search.returnFlight))) {
        setError("Please fill in every flight detail, including the ATL terminal.");
        return;
      }
      if (search.roundTrip) {
        const out = `${search.outboundFlight.date}T${search.outboundFlight.time}`;
        const ret = `${search.returnFlight.date}T${search.returnFlight.time}`;
        if (ret <= out) {
          setError("Your return flight must be after your outbound flight.");
          return;
        }
      }
      // Flight dates drive the search. Step 2 may still pick a shuttle on the
      // day before/after when the flight is near midnight.
      setError("");
      onNext({
        ...search,
        date: search.outboundFlight.date,
        returnDate: search.roundTrip ? search.returnFlight.date : "",
      });
      return;
    }
    if (search.roundTrip) {
      if (!search.returnDate) {
        setError("Please select a return date for your round trip.");
        return;
      }
      if (search.returnDate < search.date) {
        setError("Your return date can't be before your departure date.");
        return;
      }
    }
    setError("");
    onNext(search);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-white text-2xl font-bold mb-1">Plan Your Trip</h2>
        <p className="text-[#A1A1AA] text-sm">Columbus ⇄ Atlanta Airport · Departures every 2 hours, 24/7</p>
      </div>

      {/* Route */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:gap-2">
        <div className="flex-1 min-w-0">
          <Label className="text-[#A1A1AA] text-xs mb-2 block">From</Label>
          <Select value={search.from} onValueChange={handleFrom}>
            <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <span className="flex-1 min-w-0 text-left text-sm truncate">{LOCATION_LABELS[search.from] ?? search.from}</span>
            </SelectTrigger>
            <SelectContent className="bg-[#171717] border-white/10">
              {Object.entries(LOCATIONS).map(([key, loc]) => (
                <SelectItem key={key} value={key} className="text-white focus:bg-white/10">
                  {loc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Swap button — visible on all screen sizes */}
        <button
          type="button"
          onClick={swapLocations}
          aria-label="Switch directions"
          className="self-center mt-4 -mb-2 sm:mt-0 sm:self-auto sm:mb-[1px] flex-shrink-0 w-9 h-9 sm:w-10 sm:h-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#A1A1AA] hover:text-[#FCC300] hover:border-[#FCC300]/50 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4 rotate-90 sm:rotate-0" />
        </button>

        <div className="flex-1 min-w-0">
          <Label className="text-[#A1A1AA] text-xs mb-2 block">To</Label>
          <Select value={search.to} onValueChange={handleTo}>
            <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <span className="flex-1 min-w-0 text-left text-sm truncate">{LOCATION_LABELS[search.to] ?? search.to}</span>
            </SelectTrigger>
            <SelectContent className="bg-[#171717] border-white/10">
              {Object.entries(LOCATIONS).map(([key, loc]) => (
                <SelectItem key={key} value={key} className="text-white focus:bg-white/10">
                  {loc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Round trip + flight toggles */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <ChoiceSwitch value={roundTripValue} onChange={chooseRoundTrip}
          offLabel="One Way" onLabel="Round Trip" groupLabel="Trip type"
          invalid={triedSubmit} />
        <ChoiceSwitch value={hasFlightValue} onChange={chooseFlight}
          offLabel="No flight" onLabel="I have a flight" groupLabel="Do you have a flight?"
          invalid={triedSubmit} />
      </div>

      {hasFlightValue ? (
        <div className="space-y-3">
          <p className="text-[#A1A1AA] text-xs">
            Tell us about your flight and we&apos;ll show the Volt departures that fit it.
          </p>
          <FlightFields
            title={search.roundTrip ? "Outbound Flight" : "Your Flight"}
            direction={flightDirection(search.from)}
            flight={search.outboundFlight}
            minDate={today}
            onChange={(f) => setFlight("outboundFlight", f)}
          />
          {search.roundTrip && (
            <FlightFields
              title="Return Flight"
              direction={flightDirection(search.to)}
              flight={search.returnFlight}
              minDate={search.outboundFlight.date || today}
              onChange={(f) => setFlight("returnFlight", f)}
            />
          )}
        </div>
      ) : (
        /* Dates */
        <div className={`grid gap-3 ${search.roundTrip ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">
              {search.roundTrip ? "Departure Date" : "Travel Date"}
            </Label>
            <input
              type="date"
              required
              value={search.date}
              onChange={(e) => {
                const date = e.target.value;
                setSearch((prev) => ({
                  ...prev,
                  date,
                  // keep the return date valid if departure moves past it
                  returnDate: prev.returnDate && prev.returnDate < date ? "" : prev.returnDate,
                }));
              }}
              min={today}
              className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] transition-colors [color-scheme:dark]"
            />
          </div>

          {search.roundTrip && (
            <div>
              <Label className="text-[#A1A1AA] text-xs mb-2 block">Return Date</Label>
              <input
                type="date"
                required
                value={search.returnDate}
                onChange={(e) => set("returnDate", e.target.value)}
                min={search.date || today}
                className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] transition-colors [color-scheme:dark]"
              />
            </div>
          )}
        </div>
      )}

      {/* Passenger counts */}
      <div>
        <Label className="text-[#A1A1AA] text-xs mb-3 block">Passengers & Add-ons</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Adults", key: "adults", opts: [1,2,3,4,5,6,7,8], handler: handleAdults, value: search.adults },
            { label: "Children", key: "children", opts: [0,1,2,3,4,5], handler: handleChildren, value: search.children },
            { label: "Pets", key: "pets", opts: [0,1,2], handler: handlePets, value: search.pets },
            { label: "Extra Bags", key: "extraBags", opts: [0,1,2,3,4], handler: handleBags, value: search.extraBags },
          ].map((field) => (
            <div key={field.key}>
              <Label className="text-[#A1A1AA] text-xs mb-1.5 block">{field.label}</Label>
              <Select value={String(field.value)} onValueChange={field.handler}>
                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-11 rounded-xl text-sm">
                  <span className="flex-1 text-left">{field.value}</span>
                </SelectTrigger>
                <SelectContent className="bg-[#171717] border-white/10">
                  {field.opts.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-white focus:bg-white/10">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing preview */}
      <div className="glass rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[#A1A1AA] text-xs">Estimated total</p>
          <p className="text-white font-bold text-lg">
            ${(search.adults * 59 + search.children * 49 + search.pets * 25 + search.extraBags * 10) * (search.roundTrip ? 2 : 1)}
          </p>
        </div>
        <p className="text-[#A1A1AA] text-xs max-w-[160px] text-right">
          Final price confirmed at checkout
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-sm text-center -mt-2">{error}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-13 text-base rounded-xl group"
      >
        Find Available Rides
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </form>
  );
}
