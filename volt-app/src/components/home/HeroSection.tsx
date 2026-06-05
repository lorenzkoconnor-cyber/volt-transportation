"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { LOCATIONS } from "@/lib/booking";

type LocationKey = "columbus" | "atl";

export default function HeroSection() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // ── Booking state (matches Step1Search exactly) ──────────────────────────
  const [from, setFrom]           = useState<LocationKey>("columbus");
  const [to, setTo]               = useState<LocationKey>("atl");
  const [date, setDate]           = useState("");
  const [adults, setAdults]       = useState(1);
  const [children, setChildren]   = useState(0);
  const [pets, setPets]           = useState(0);
  const [extraBags, setExtraBags] = useState(0);
  const [roundTrip, setRoundTrip] = useState(false);

  const handleFrom     = (v: string | null) => { if (v) setFrom(v as LocationKey); };
  const handleTo       = (v: string | null) => { if (v) setTo(v as LocationKey); };
  const handleAdults   = (v: string | null) => { if (v) setAdults(Number(v)); };
  const handleChildren = (v: string | null) => { if (v !== null) setChildren(Number(v)); };
  const handlePets     = (v: string | null) => { if (v !== null) setPets(Number(v)); };
  const handleBags     = (v: string | null) => { if (v !== null) setExtraBags(Number(v)); };

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  const estimatedTotal =
    (adults * 59 + children * 49 + pets * 25 + extraBags * 10) *
    (roundTrip ? 2 : 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      from, to, date,
      adults: String(adults),
      children: String(children),
      pets: String(pets),
      extraBags: String(extraBags),
      roundTrip: String(roundTrip),
    });
    router.push(`/book?${params.toString()}`);
  };

  // ── Scroll-driven video parallax ─────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    let animFrame: number;

    const onScroll = () => {
      animFrame = requestAnimationFrame(() => {
        const scrollY      = window.scrollY;
        const sectionH     = section.offsetHeight;
        const progress     = Math.min(scrollY / sectionH, 1); // 0 → 1 as hero exits

        // Parallax: move video up at half scroll speed
        video.style.transform = `translateY(${scrollY * 0.4}px) scale(1.08)`;

        // Fade video out as user scrolls away
        video.style.opacity   = String(1 - progress * 1.4);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex flex-col justify-between overflow-hidden"
    >
      {/* ── Video background ──────────────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          ref={videoRef}
          src="/images/voltvanvid1.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover will-change-transform"
          style={{ transformOrigin: "center center" }}
        />
        {/* Dark overlay — heavy left, lighter right to show van */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/92 via-[#0A0A0A]/70 to-[#0A0A0A]/35" />
        {/* Bottom fade so feature strip reads cleanly */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/20 to-transparent" />
        {/* Top fade so navbar reads over video */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/60 via-transparent to-transparent" />
      </div>

      {/* Purple ambient glow */}
      <div className="absolute bottom-32 left-0 w-[600px] h-[400px] bg-[#7C3AED]/10 blur-[140px] pointer-events-none" />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col justify-between min-h-screen max-w-7xl mx-auto w-full px-6 lg:px-10">

        {/* Spacer for navbar */}
        <div className="h-20 lg:h-24" />

        {/* ── Hero text ─────────────────────────────────────────────────── */}
        <div className="pt-4 pb-8 max-w-3xl">
          {/* Above heading */}
          <p className="text-[#7C3AED] text-xs sm:text-sm font-bold tracking-[0.3em] uppercase mb-4">
            Premium Airport Transportation
          </p>

          {/* Main heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-[4.5rem] font-black leading-[0.95] tracking-tight text-white mb-4 uppercase">
            Columbus GA
            <br />
            to Atlanta Airport
          </h1>

          {/* Below heading */}
          <p className="text-[#9D5FF5] text-xl sm:text-2xl font-bold tracking-wide uppercase mb-5">
            Ride in Comfort. Arrive Relaxed.
          </p>

          {/* Subtext */}
          <p className="text-[#B8B8B8] text-base sm:text-lg leading-relaxed">
            Luxury Mercedes Sprinter vans. Professional chauffeurs.
            <br className="hidden sm:block" />
            Reserved seating. <span className="text-white font-semibold">Starting at $59.</span>
          </p>
        </div>

        {/* ── Booking widget — identical to /book Step 1 ────────────────── */}
        <div className="pb-10 lg:pb-14 w-full max-w-xl">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(13, 13, 18, 0.90)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.08)",
            }}
          >
            {/* Widget header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <div>
                <h2 className="text-white font-bold text-base">Plan Your Trip</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">Columbus ⇄ Atlanta Airport · Hourly departures</p>
              </div>
              <a href="/manage-reservation" className="text-[#7C3AED] text-xs hover:text-[#9D5FF5] transition-colors font-medium">
                Manage Reservation
              </a>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* From / To */}
              <div className="grid grid-cols-2 gap-4 relative">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-2 block">From</Label>
                  <Select value={from} onValueChange={handleFrom}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#171717] border-white/10">
                      {Object.entries(LOCATIONS).map(([key, loc]) => (
                        <SelectItem key={key} value={key} disabled={key === to} className="text-white focus:bg-white/10">
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
                  <Select value={to} onValueChange={handleTo}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#171717] border-white/10">
                      {Object.entries(LOCATIONS).map(([key, loc]) => (
                        <SelectItem key={key} value={key} disabled={key === from} className="text-white focus:bg-white/10">
                          {loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Travel date */}
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-2 block">Travel Date</Label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
                />
              </div>

              {/* Round trip toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRoundTrip(!roundTrip)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${roundTrip ? "bg-[#7C3AED]" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${roundTrip ? "translate-x-5" : ""}`} />
                </button>
                <span
                  className="text-[#A1A1AA] text-sm cursor-pointer select-none"
                  onClick={() => setRoundTrip(!roundTrip)}
                >
                  Round Trip
                </span>
              </div>

              {/* Passengers & add-ons */}
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-3 block">Passengers & Add-ons</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Adults",     opts: [1,2,3,4,5,6,7,8], handler: handleAdults,   value: adults    },
                    { label: "Children",   opts: [0,1,2,3,4,5],     handler: handleChildren, value: children  },
                    { label: "Pets",       opts: [0,1,2],           handler: handlePets,     value: pets      },
                    { label: "Extra Bags", opts: [0,1,2,3,4],       handler: handleBags,     value: extraBags },
                  ].map((field) => (
                    <div key={field.label}>
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

              {/* Price estimate */}
              <div className="glass rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[#A1A1AA] text-xs">Estimated total</p>
                  <p className="text-white font-bold text-lg">${estimatedTotal}</p>
                </div>
                <p className="text-[#A1A1AA] text-xs text-right max-w-[140px]">
                  Final price confirmed at checkout
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-13 text-base rounded-xl group transition-colors"
              >
                Find Available Rides
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Feature strip ─────────────────────────────────────────────────── */}
      <div className="relative z-10 bg-[#0A0A0A]/85 backdrop-blur-sm border-t border-white/6">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "🛡️", label: "Safe & Reliable",    sub: "Your safety is our priority. Every ride, every time." },
              { icon: "🪑", label: "Luxury Comfort",      sub: "Premium vehicles with extra legroom and spacious seating." },
              { icon: "⏰", label: "On-Time Guarantee",   sub: "Punctual, professional, and always on time." },
              { icon: "🤵", label: "White Glove Service", sub: "Personalized chauffeur-style service on every trip." },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full border border-[#7C3AED]/40 flex items-center justify-center flex-shrink-0 text-lg">
                  {item.icon}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{item.label}</div>
                  <div className="text-[#A1A1AA] text-xs leading-relaxed mt-0.5">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
