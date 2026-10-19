import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Info } from "lucide-react";
import { getAppSettings } from "@/lib/settings-server";
import { dollars, type AppSettings } from "@/lib/settings";

// Prices, the Military Discount and the cancellation fee come from
// Dashboard → Settings.
export async function generateMetadata(): Promise<Metadata> {
  const { pricing: P, military } = await getAppSettings();
  return {
    title: "Pricing | Columbus GA to ATL Airport Shuttle Fares",
    description:
      `Volt Transportation pricing: Adults ${dollars(P.adult)}, Children ${dollars(P.child)}, Pets ${dollars(P.pet)}, Extra bags ${dollars(P.extraBag)}. Transparent fares, no hidden fees.` +
      (military.enabled ? ` ${dollars(military.amount)} off every booking for active-duty and retired military.` : ""),
    alternates: { canonical: "https://volt-transportation.com/pricing" },
  };
}

const faresFor = ({ pricing: P }: AppSettings) => [
  { label: "Adult Passenger", price: P.adult, note: "Age 13+", color: "text-white" },
  { label: "Child Passenger", price: P.child, note: "Ages 2–12", color: "text-white" },
  { label: "Pet", price: P.pet, note: "Must be in carrier", color: "text-white" },
  { label: "Extra Bag", price: P.extraBag, note: "Per additional bag", color: "text-white" },
];

const included = [
  "Complimentary bottled water",
  "Luggage assistance (loading & unloading)",
  "Professional chauffeur-style driver",
  "SMS booking confirmation",
  "Trip reminder notification",
];

const policiesFor = (s: AppSettings) => [
  { title: "No Hidden Fees", desc: "The price you see at checkout is the price you pay. No surge pricing, no service fees, no surprises." },
  ...(s.military.enabled
    ? [{ title: "Military Discount", desc: `Active-duty and retired military save ${dollars(s.military.amount)} on every booking — round trip or one way, any party size. Tick the box at checkout and upload your military ID. Once you're verified, it applies automatically every time.` }]
    : []),
  { title: "Round Trip", desc: "Book both legs at once and the total is calculated automatically at checkout. No separate booking needed." },
  {
    title: "Cancellation",
    desc: `Cancel by 11:59 PM (Eastern) the day before your trip for a refund of your fare${s.cancellationFeeCents > 0 ? ` minus a ${dollars(s.cancellationFeeCents / 100)} cancellation fee` : ""}. Changes by phone are free.`,
  },
];

export default async function PricingPage() {
  const settings = await getAppSettings();
  const P = settings.pricing;
  const fares = faresFor(settings);
  const policies = policiesFor(settings);
  const example = [
    { label: "2 Adults", calc: `2 × ${dollars(P.adult)}`, amount: 2 * P.adult },
    { label: "2 Children", calc: `2 × ${dollars(P.child)}`, amount: 2 * P.child },
    { label: "1 Extra Bag", calc: `1 × ${dollars(P.extraBag)}`, amount: P.extraBag },
  ];
  const exampleTotal = example.reduce((n, r) => n + r.amount, 0);
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-[#FCC300]/8 blur-[100px] pointer-events-none" />
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
                          <span className="text-white text-3xl font-bold">{dollars(fare.price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {settings.military.enabled && (
                  <div className="p-5 bg-[#FCC300]/5 border-t border-[#FCC300]/20 flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#FCC300] flex-shrink-0 mt-0.5" />
                    <p className="text-[#FCC300] text-sm">
                      Active-duty &amp; retired military save {dollars(settings.military.amount)} on every booking.{" "}
                      <Link href="/military" className="underline underline-offset-2 hover:text-[#FFD54A]">
                        See who qualifies &amp; how we give back
                      </Link>
                    </p>
                  </div>
                  )}
                </div>

                <div className="mt-6 glass rounded-2xl p-6">
                  <h3 className="text-white font-bold text-lg mb-1">Round Trip</h3>
                  <p className="text-[#A1A1AA] text-sm mb-4">
                    Toggle "Round Trip" in the booking form to add your return leg. Pricing is calculated automatically. Both trips are managed under one confirmation.
                  </p>
                  <Link href="/book">
                    <Button className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold group">
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
                        <div className="w-5 h-5 rounded-full bg-[#FCC300]/15 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-[#FCC300]" />
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
                {example.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-5 py-3">
                    <div className="text-white text-sm">{row.label}</div>
                    <div className="flex items-center gap-4">
                      <span className="text-[#A1A1AA] text-xs">{row.calc}</span>
                      <span className="text-white font-medium w-16 text-right">{dollars(row.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-4 bg-[#FCC300]/8 border-t border-[#FCC300]/20">
                <span className="text-white font-bold">Total</span>
                <span className="text-white text-2xl font-bold">{dollars(exampleTotal)}</span>
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
              <Button size="lg" className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold px-10 py-6 text-base rounded-xl volt-glow">
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
