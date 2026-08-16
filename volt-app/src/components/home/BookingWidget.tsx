"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, ArrowRight, Calendar, Users } from "lucide-react";

const LOCATIONS = [
  { value: "columbus", label: "Columbus, GA" },
  { value: "atl",     label: "ATL Airport" },
];

export default function BookingWidget() {
  const router = useRouter();
  const [from,      setFrom]      = useState("columbus");
  const [to,        setTo]        = useState("atl");
  const [date,      setDate]      = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults,    setAdults]    = useState("1");
  const [children,  setChildren]  = useState("0");
  const [pets,      setPets]      = useState("0");
  const [extraBags, setExtraBags] = useState("0");
  const [roundTrip, setRoundTrip] = useState(false);

  // When user manually picks a location, auto-swap the other field if needed
  const handleFrom = (v: string | null) => {
    if (!v) return;
    if (v === to) setTo(from);
    setFrom(v);
  };
  const handleTo = (v: string | null) => {
    if (!v) return;
    if (v === from) setFrom(to);
    setTo(v);
  };
  const handleAdults    = (v: string | null) => { if (v) setAdults(v); };
  const handleChildren  = (v: string | null) => { if (v) setChildren(v); };
  const handlePets      = (v: string | null) => { if (v) setPets(v); };
  const handleExtraBags = (v: string | null) => { if (v) setExtraBags(v); };

  const swapLocations = () => { setFrom(to); setTo(from); };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      from, to, date, adults, children, pets, extraBags,
      roundTrip: String(roundTrip),
      returnDate: roundTrip ? returnDate : "",
    });
    router.push(`/book?${params.toString()}`);
  };

  return (
    <section className="relative z-20 -mt-8 px-4 sm:px-6 lg:px-8 pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-6 sm:p-8 purple-glow">

          {/* Round trip toggle */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-[#A1A1AA] text-sm font-medium">Trip Type</span>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button type="button" onClick={() => setRoundTrip(false)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${!roundTrip ? "bg-[#7C3AED] text-white" : "text-[#A1A1AA] hover:text-white"}`}>
                One Way
              </button>
              <button type="button" onClick={() => setRoundTrip(true)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${roundTrip ? "bg-[#7C3AED] text-white" : "text-[#A1A1AA] hover:text-white"}`}>
                Round Trip
              </button>
            </div>
          </div>

          <form onSubmit={handleSearch}>
            {/* ── From / Swap / To ─────────────────────────────────── */}
            <div className="flex items-end gap-2 mb-4">
              <div className="flex-1">
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">From</Label>
                <Select value={from} onValueChange={handleFrom}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc.value} value={loc.value} className="text-white focus:bg-white/10">
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
                className="mb-[1px] flex-shrink-0 w-10 h-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#A1A1AA] hover:text-[#7C3AED] hover:border-[#7C3AED]/50 transition-colors"
                aria-label="Switch directions"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <div className="flex-1">
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">To</Label>
                <Select value={to} onValueChange={handleTo}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc.value} value={loc.value} className="text-white focus:bg-white/10">
                        {loc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Date(s) / Passengers ─────────────────────────────── */}
            <div className={`grid grid-cols-1 gap-4 mb-4 ${roundTrip ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">
                  <Calendar className="inline w-3 h-3 mr-1" />
                  {roundTrip ? "Departure Date" : "Date"}
                </Label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDate(v);
                    // Keep the return date on or after departure.
                    if (returnDate && returnDate < v) setReturnDate(v);
                  }}
                  min={new Date().toISOString().split("T")[0]}
                  required
                  className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
                />
              </div>
              {roundTrip && (
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">
                    <Calendar className="inline w-3 h-3 mr-1" />
                    Return Date
                  </Label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    min={date || new Date().toISOString().split("T")[0]}
                    required
                    className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
                  />
                </div>
              )}
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">
                  <Users className="inline w-3 h-3 mr-1" />
                  Passengers
                </Label>
                <Select value={adults} onValueChange={handleAdults}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                    <SelectValue placeholder="Adults" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-white focus:bg-white/10">
                        {n} Adult{n > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Secondary fields */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Children</Label>
                <Select value={children} onValueChange={handleChildren}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-white focus:bg-white/10">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Pets</Label>
                <Select value={pets} onValueChange={handlePets}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {[0, 1, 2].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-white focus:bg-white/10">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Extra Bags</Label>
                <Select value={extraBags} onValueChange={handleExtraBags}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#171717] border-white/10">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-white focus:bg-white/10">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" size="lg"
              className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-14 text-base rounded-xl transition-all group">
              Find Available Rides
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
