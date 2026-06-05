import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight, Clock, Car, Plane } from "lucide-react";

export const metadata: Metadata = {
  title: "Locations | Columbus GA & ATL Airport Pickup Points",
  description:
    "Volt Transportation pickup and drop-off locations in Columbus, GA and Hartsfield-Jackson Atlanta International Airport (ATL). Maps, parking info, and terminal instructions.",
  alternates: { canonical: "https://volttransportation.com/locations" },
};

export default function LocationsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-0 w-[400px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">Locations</h1>
            <p className="text-[#A1A1AA] text-lg">
              Pickup and drop-off points for your Columbus ⇄ Atlanta Airport shuttle.
            </p>
          </div>
        </section>

        {/* Locations */}
        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto space-y-10">
            {/* Columbus */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-8 lg:p-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <div>
                      <p className="text-[#A1A1AA] text-xs uppercase tracking-wider">Departure Point</p>
                      <h2 className="text-white font-bold text-xl">Columbus, Georgia</h2>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Address</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">Columbus, GA — Exact address provided in booking confirmation</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Arrivals</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">Please arrive 10 minutes before your scheduled departure</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Car className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Parking</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">Free parking available at pickup location</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4 border border-[#7C3AED]/20">
                    <p className="text-[#7C3AED] text-sm font-medium">
                      📍 Your exact pickup address and any special instructions will be included in your SMS confirmation after booking.
                    </p>
                  </div>
                </div>

                {/* Map placeholder */}
                <div className="bg-[#0F0F0F] min-h-[280px] flex items-center justify-center border-t lg:border-t-0 lg:border-l border-white/8">
                  <div className="text-center p-8">
                    <MapPin className="w-12 h-12 text-[#7C3AED]/40 mx-auto mb-3" />
                    <p className="text-[#A1A1AA] text-sm">Map coming soon</p>
                    <p className="text-[#A1A1AA] text-xs mt-1">Columbus, GA pickup location</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ATL */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-8 lg:p-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center">
                      <Plane className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <div>
                      <p className="text-[#A1A1AA] text-xs uppercase tracking-wider">Airport Location</p>
                      <h2 className="text-white font-bold text-xl">Hartsfield-Jackson Atlanta International</h2>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Airport Address</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">6000 N Terminal Pkwy, Atlanta, GA 30320</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Plane className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Drop-Off & Pickup</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">Domestic Terminal curbside. Terminal confirmed at time of booking based on your airline.</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[#A1A1AA] flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white font-medium text-sm">Return Pickups</div>
                        <div className="text-[#A1A1AA] text-sm mt-0.5">Meet your driver at the designated ground transportation area after baggage claim</div>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4 border border-[#7C3AED]/20">
                    <p className="text-[#7C3AED] text-sm font-medium">
                      ✈️ Volt picks up from ATL in the ground transportation area after baggage claim. Your driver will be waiting with a Volt sign.
                    </p>
                  </div>
                </div>

                {/* Map placeholder */}
                <div className="bg-[#0F0F0F] min-h-[280px] flex items-center justify-center border-t lg:border-t-0 lg:border-l border-white/8">
                  <div className="text-center p-8">
                    <Plane className="w-12 h-12 text-[#7C3AED]/40 mx-auto mb-3" />
                    <p className="text-[#A1A1AA] text-sm">Map coming soon</p>
                    <p className="text-[#A1A1AA] text-xs mt-1">ATL Airport pickup location</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Route info */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-4">The Route</h2>
            <p className="text-[#A1A1AA] mb-8">Columbus, GA → Hartsfield-Jackson ATL International Airport · Approximately 2–2.5 hours</p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className="glass rounded-xl px-6 py-4">
                <div className="text-white font-bold">Columbus, GA</div>
                <div className="text-[#A1A1AA] text-xs">Starting point</div>
              </div>
              <ArrowRight className="w-6 h-6 text-[#7C3AED]" />
              <div className="glass rounded-xl px-6 py-4 border border-[#7C3AED]/30">
                <div className="text-white font-bold">I-185 / I-85</div>
                <div className="text-[#A1A1AA] text-xs">~100 miles</div>
              </div>
              <ArrowRight className="w-6 h-6 text-[#7C3AED]" />
              <div className="glass rounded-xl px-6 py-4">
                <div className="text-white font-bold">ATL Airport</div>
                <div className="text-[#A1A1AA] text-xs">Terminal drop-off</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to reserve your seat?</h2>
            <p className="text-[#A1A1AA] mb-8">Your exact pickup address is included in your confirmation text — book now and we'll handle the rest.</p>
            <Link href="/book">
              <Button size="lg" className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold px-10 py-6 text-base rounded-xl purple-glow">
                Book Your Ride <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
