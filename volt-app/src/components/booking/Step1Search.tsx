"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { type BookingSearch, LOCATIONS } from "@/lib/booking";

interface Props {
  initial: BookingSearch;
  onNext: (search: BookingSearch) => void;
}

export default function Step1Search({ initial, onNext }: Props) {
  const [search, setSearch] = useState<BookingSearch>(initial);

  const set = (key: keyof BookingSearch, value: string | number | boolean) =>
    setSearch((prev) => ({ ...prev, [key]: value }));

  const swapLocations = () =>
    setSearch((prev) => ({ ...prev, from: prev.to, to: prev.from }));

  const handleFrom = (v: string | null) => { if (v) set("from", v as "columbus" | "atl"); };
  const handleTo = (v: string | null) => { if (v) set("to", v as "columbus" | "atl"); };
  const handleAdults = (v: string | null) => { if (v) set("adults", Number(v)); };
  const handleChildren = (v: string | null) => { if (v !== null) set("children", Number(v)); };
  const handlePets = (v: string | null) => { if (v !== null) set("pets", Number(v)); };
  const handleBags = (v: string | null) => { if (v !== null) set("extraBags", Number(v)); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(search);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-white text-2xl font-bold mb-1">Plan Your Trip</h2>
        <p className="text-[#A1A1AA] text-sm">Columbus ⇄ Atlanta Airport · Hourly departures</p>
      </div>

      {/* Route */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">From</Label>
          <Select value={search.from} onValueChange={handleFrom}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#171717] border-white/10">
              {Object.entries(LOCATIONS).map(([key, loc]) => (
                <SelectItem key={key} value={key} disabled={key === search.to} className="text-white focus:bg-white/10">
                  {loc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Swap button */}
        <button
          type="button"
          onClick={swapLocations}
          className="absolute left-1/2 -translate-x-1/2 top-7 z-10 hidden sm:flex w-8 h-8 rounded-full bg-[#171717] border border-white/10 items-center justify-center text-[#A1A1AA] hover:text-[#7C3AED] hover:border-[#7C3AED]/50 transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">To</Label>
          <Select value={search.to} onValueChange={handleTo}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#171717] border-white/10">
              {Object.entries(LOCATIONS).map(([key, loc]) => (
                <SelectItem key={key} value={key} disabled={key === search.from} className="text-white focus:bg-white/10">
                  {loc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date */}
      <div>
        <Label className="text-[#A1A1AA] text-xs mb-2 block">Travel Date</Label>
        <input
          type="date"
          required
          value={search.date}
          onChange={(e) => set("date", e.target.value)}
          min={new Date().toISOString().split("T")[0]}
          className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
        />
      </div>

      {/* Round trip */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => set("roundTrip", !search.roundTrip)}
          className={`relative w-11 h-6 rounded-full transition-colors ${search.roundTrip ? "bg-[#7C3AED]" : "bg-white/10"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${search.roundTrip ? "translate-x-5" : ""}`}
          />
        </button>
        <Label className="text-[#A1A1AA] text-sm cursor-pointer" onClick={() => set("roundTrip", !search.roundTrip)}>
          Round Trip
        </Label>
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
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-11 rounded-xl text-sm">
                  <SelectValue />
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
