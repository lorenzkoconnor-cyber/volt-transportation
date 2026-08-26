"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ArrowRight, ArrowLeftRight, ChevronDown } from "lucide-react";
import { type BookingSearch, LOCATIONS } from "@/lib/booking";

const LOCATION_LABELS: Record<string, string> = {
  columbus: "Columbus, GA",
  atl: "ATL Airport",
};

interface Props {
  initial: BookingSearch;
  onNext: (search: BookingSearch) => void;
}

export default function Step1Search({ initial, onNext }: Props) {
  const [search, setSearch] = useState<BookingSearch>(initial);
  const [error, setError] = useState("");

  const set = (key: keyof BookingSearch, value: string | number | boolean) =>
    setSearch((prev) => ({ ...prev, [key]: value }));

  const toggleRoundTrip = () =>
    setSearch((prev) => ({
      ...prev,
      roundTrip: !prev.roundTrip,
      // clear a stale return date when switching back to one-way
      returnDate: !prev.roundTrip ? prev.returnDate : "",
    }));

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
        <p className="text-[#A1A1AA] text-sm">Columbus ⇄ Atlanta Airport · Hourly departures</p>
      </div>

      {/* Route */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-[#A1A1AA] text-xs mb-2 block">From</Label>
          <Select value={search.from} onValueChange={handleFrom}>
            <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <span className="flex-1 text-left text-sm truncate">{LOCATION_LABELS[search.from] ?? search.from}</span>
              <ChevronDown className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
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
          className="mb-[1px] flex-shrink-0 w-10 h-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#A1A1AA] hover:text-[#7C3AED] hover:border-[#7C3AED]/50 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>

        <div className="flex-1">
          <Label className="text-[#A1A1AA] text-xs mb-2 block">To</Label>
          <Select value={search.to} onValueChange={handleTo}>
            <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <span className="flex-1 text-left text-sm truncate">{LOCATION_LABELS[search.to] ?? search.to}</span>
              <ChevronDown className="w-4 h-4 text-[#A1A1AA] flex-shrink-0" />
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

      {/* Round trip */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleRoundTrip}
          className={`relative w-11 h-6 rounded-full transition-colors ${search.roundTrip ? "bg-[#7C3AED]" : "bg-white/10"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${search.roundTrip ? "translate-x-5" : ""}`}
          />
        </button>
        <Label className="text-[#A1A1AA] text-sm cursor-pointer" onClick={toggleRoundTrip}>
          Round Trip
        </Label>
      </div>

      {/* Dates */}
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
            min={new Date().toISOString().split("T")[0]}
            className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
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
              min={search.date || new Date().toISOString().split("T")[0]}
              className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
            />
          </div>
        )}
      </div>

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
                  <ChevronDown className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" />
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
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-13 text-base rounded-xl group"
      >
        Find Available Rides
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </form>
  );
}
