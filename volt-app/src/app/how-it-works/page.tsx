import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Smartphone, MessageSquare, MapPin, User, Coffee, Plane } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works | Volt Transportation Shuttle Service",
  description:
    "Booking your Columbus GA to Atlanta Airport shuttle with Volt is simple — 6 easy steps from online booking to arrival at your destination.",
  alternates: { canonical: "https://volttransportation.com/how-it-works" },
};

const steps = [
  {
    number: "01",
    icon: Smartphone,
    title: "Book Your Trip Online",
    desc: "Choose your route, date, departure time, and number of passengers. Takes less than 2 minutes. No account required.",
  },
  {
    number: "02",
    icon: MessageSquare,
    title: "Receive Confirmation by Text",
    desc: "You'll receive an SMS confirmation with your booking summary, confirmation number, and pickup details immediately after booking.",
  },
  {
    number: "03",
    icon: MapPin,
    title: "Arrive at Your Pickup Location",
    desc: "Head to the designated Columbus pickup location at least 10 minutes before your scheduled departure time.",
  },
  {
    number: "04",
    icon: User,
    title: "Meet Your Driver",
    desc: "Your professional Volt driver will be there, ready to assist with your luggage and get you settled in comfortably.",
  },
  {
    number: "05",
    icon: Coffee,
    title: "Relax and Enjoy the Ride",
    desc: "Sit back in your spacious Mercedes Sprinter. Enjoy complimentary water, USB charging, and a smooth, comfortable ride.",
  },
  {
    number: "06",
    icon: Plane,
    title: "Arrive at Your Destination",
    desc: "Volt drops you off at the correct ATL terminal. Your driver handles your luggage. You head straight to check-in.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">
              How It Works
            </h1>
            <p className="text-[#A1A1AA] text-lg leading-relaxed">
              First-time shuttle traveler? No problem. Here's exactly what to expect when you ride with Volt — from booking to arrival.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 pb-24">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-[#7C3AED] via-[#7C3AED]/30 to-transparent hidden sm:block" />

              <div className="space-y-6">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.number} className="relative flex gap-6 sm:gap-10 items-start">
                      {/* Step number / icon */}
                      <div className="relative flex-shrink-0">
                        <div className="w-16 h-16 rounded-2xl bg-[#7C3AED] flex items-center justify-center purple-glow z-10 relative">
                          <Icon className="w-7 h-7 text-white" />
                        </div>
                        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#0A0A0A] border border-[#7C3AED]/50 flex items-center justify-center text-[#7C3AED] text-xs font-bold">
                          {index + 1}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 glass rounded-2xl p-6 mb-2">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-[#7C3AED] text-xs font-bold tracking-wider">STEP {step.number}</span>
                        </div>
                        <h2 className="text-white text-xl font-bold mb-2">{step.title}</h2>
                        <p className="text-[#A1A1AA] leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Tips */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Helpful Tips</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { tip: "Arrive 10 minutes early", detail: "The shuttle departs on time. Don't miss it by being late to the pickup point." },
                { tip: "Pack light when possible", detail: "Each passenger can bring one bag free. Extra bags are $10 each." },
                { tip: "Save your confirmation number", detail: "You'll need it if you need to manage or modify your reservation." },
                { tip: "Bring your boarding pass", detail: "Have your flight info handy — your driver may ask about your terminal for drop-off." },
              ].map((item) => (
                <div key={item.tip} className="glass rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-1">{item.tip}</h3>
                  <p className="text-[#A1A1AA] text-sm">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to book?</h2>
            <p className="text-[#A1A1AA] mb-8">It really is as simple as it looks. Book now and we'll take care of the rest.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/book">
                <Button size="lg" className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold px-10 py-6 text-base rounded-xl purple-glow">
                  Book Your Ride <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="border-white/15 text-white hover:bg-white/5 font-semibold px-10 py-6 text-base rounded-xl">
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
