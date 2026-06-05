import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Info } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing | Columbus GA to ATL Airport Shuttle Fares",
  description:
    "Volt Transportation pricing: Adults $59, Children $49, Pets $25, Extra bags $10. Transparent fares, no hidden fees. Military discount available.",
  alternates: { canonical: "https://volttransportation.com/pricing" },
};

const fares = [
  { label: "Adult Passenger", price: 59, note: "Age 13+", color: "text-white" },
  { label: "Child Passenger", price: 49, note: "Ages 2–12", color: "text-white" },
  { label: "Pet", price: 25, note: "Must be in carrier", color: "text-white" },
  { label: "Extra Bag", price: 10, note: "Per additional bag", color: "text-white" },
];

const included = [
  "Complimentary bottled water",
  "USB charging at every seat",
  "Luggage assistance (loading & unloading)",
  "Professional chauffeur-style driver",
  "SMS booking confirmation",
  "Trip reminder notification",
];

const policies = [
  { title: "No Hidden Fees", desc: "The price you see at checkout is the price you pay. No surge pricing, no service fees, no surprises." },
  { title: "Military Discount", desc: "We proudly offer a military discount. Contact us or mention it at booking and our team will apply it." },
  { title: "Round Trip", desc: "Book both legs at once and the total is calculated automatically at checkout. No separate booking needed." },
  { title: "Cancellation", desc: "Cancel or modify your reservation by 11:59 PM the day before your trip for a full refund." },
];

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">Pricing</h1>
            <p className="text-[#A1A1AA] text-lg">
              Simple, transparent fares. Columbus ⇄ Atlanta Airport.
            </p>
          </div>
        </section>

        {/* Main pricing */}
        <section className="pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Fare table */}
              <div>
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-white/8">
                    <h2 className="text-white font-bold text-xl">One-Way Fares</h2>
                    <p className="text-[#A1A1AA] text-sm mt-1">Per person / per item · Columbus ⇄ ATL</p>
                  </div>
                  <div className="divide-y divide-white/8">
                    {fares.map((fare) => (
                      <div key={fare.label} className="flex items-center justify-between p-6">
                        <div>
                          <div className="text-white font-semibold">{fare.label}</div>
                          <div className="text-[#A1A1AA] text-xs mt-0.5">{fare.note}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-white text-3xl font-bold">${fare.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-5 bg-[#7C3AED]/5 border-t border-[#7C3AED]/20 flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#7C3AED] flex-shrink-0 mt-0.5" />
                    <p className="text-[#7C3AED] text-sm">
                      Military discount available — contact us or mention at booking and we'll apply it.
                    </p>
                  </div>
                </div>

                <div className="mt-6 glass rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Round Trip</h3>
                  <p className="text-[#A1A1AA] text-sm mb-4">
                    Toggle "Round Trip" in the booking form to add your return leg. Pricing is calculated automatically. Both trips are managed under one confirmation.
                  </p>
                  <Link href="/book">
                    <Button className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold group">
                      Book Now
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* What's included + policies */}
              <div className="space-y-6">
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-5">Included With Every Seat</h3>
                  <ul className="space-y-3">
                    {included.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-[#7C3AED]" />
                        </div>
                        <span className="text-[#A1A1AA] text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="glass rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-5">Fare Policies</h3>
                  <div className="space-y-4">
                    {policies.map((policy) => (
                      <div key={policy.title}>
                        <div className="text-white font-medium text-sm mb-1">{policy.title}</div>
                        <p className="text-[#A1A1AA] text-sm leading-relaxed">{policy.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Example calculation */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Example Trip Cost</h2>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/8">
                <p className="text-[#A1A1AA] text-sm">Family of 4: 2 adults + 2 children + 1 extra bag · One-way</p>
              </div>
              <div className="divide-y divide-white/8">
                {[
                  { label: "2 Adults", calc: "2 × $59", amount: 118 },
                  { label: "2 Children", calc: "2 × $49", amount: 98 },
                  { label: "1 Extra Bag", calc: "1 × $10", amount: 10 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-5 py-3">
                    <div className="text-white text-sm">{row.label}</div>
                    <div className="flex items-center gap-4">
                      <span className="text-[#A1A1AA] text-xs">{row.calc}</span>
                      <span className="text-white font-medium w-16 text-right">${row.amount}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-4 bg-[#7C3AED]/8 border-t border-[#7C3AED]/20">
                <span className="text-white font-bold">Total</span>
                <span className="text-white text-2xl font-bold">$226</span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to book your ride?</h2>
            <p className="text-[#A1A1AA] mb-8">No account needed. Book in under 2 minutes.</p>
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
