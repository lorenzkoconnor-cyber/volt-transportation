import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Users, Star, Zap, CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "About Volt Transportation | Columbus GA Airport Shuttle Company",
  description:
    "Learn about Volt Transportation — our mission, our fleet of black Mercedes Sprinters, and why we're Columbus GA's premier airport shuttle service to ATL.",
  alternates: { canonical: "https://volttransportation.com/about" },
};

const differentiators = [
  { icon: Zap, title: "Mercedes Sprinter Fleet", desc: "We operate a fleet of premium black Mercedes Sprinter vans — the standard for luxury group transportation." },
  { icon: Users, title: "Maximum 8 Passengers", desc: "We cap every vehicle at 8 passengers. No overcrowding. Every passenger gets room to breathe and relax." },
  { icon: Shield, title: "Professional Drivers", desc: "Every driver is background-checked, professionally trained, and held to a chauffeur-level standard of service." },
  { icon: Star, title: "Complimentary Water", desc: "Bottled water, USB charging at every seat, and full luggage assistance are included with every trip." },
  { icon: CheckCircle, title: "Extra Legroom", desc: "Sprinter vans offer generous seating space — a far more comfortable experience than rideshares or buses." },
  { icon: ArrowRight, title: "Airport-Focused Service", desc: "Everything we do is built around getting you to and from ATL on time, stress-free, every single trip." },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#7C3AED]/8 blur-[120px] pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-6">
              <Zap className="w-3.5 h-3.5 text-[#7C3AED]" />
              <span className="text-[#A1A1AA] text-xs font-medium">About Volt</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6">
              Built for Columbus.<br />
              <span className="gradient-text-purple">Built for the journey.</span>
            </h1>
            <p className="text-[#A1A1AA] text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Volt Transportation was founded with one goal — to give Columbus, Georgia travelers a better way to reach Atlanta Airport.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Volt headquarters */}
            <div className="relative rounded-2xl overflow-hidden bg-[#171717] aspect-video glass">
              <Image
                src="/images/volt-business-exterior-building.png"
                alt="Volt Transportation headquarters building in Columbus, Georgia"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/60 to-transparent pointer-events-none" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white mb-5">Our Mission</h2>
              <p className="text-[#A1A1AA] leading-relaxed mb-4">
                Safe, comfortable, and reliable transportation between Columbus, GA and Atlanta Hartsfield-Jackson International Airport. Every trip. Every passenger. Every time.
              </p>
              <p className="text-[#A1A1AA] leading-relaxed mb-6">
                We believe getting to the airport shouldn't be stressful. It should be the first part of a great trip — comfortable seats, a professional driver, and the confidence that you'll arrive on time.
              </p>
              <Link href="/book">
                <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold group">
                  Book a Ride
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Why We Started */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-6">Why We Started Volt</h2>
            <div className="glass rounded-2xl p-8 sm:p-12 text-left">
              <p className="text-[#A1A1AA] leading-relaxed mb-4 text-lg">
                Columbus travelers heading to Atlanta Airport had limited options — crowded buses, expensive rideshares with surge pricing, or asking someone to make a 5-hour round trip.
              </p>
              <p className="text-[#A1A1AA] leading-relaxed mb-4">
                We saw an opportunity to build something better. A dedicated, premium shuttle service with fixed pricing, professional drivers, and a real commitment to the Columbus community.
              </p>
              <p className="text-[#A1A1AA] leading-relaxed">
                Volt was built from the ground up for this route. Every detail — from the vehicles we chose to the 8-passenger limit — was a deliberate decision to prioritize your comfort and peace of mind.
              </p>
            </div>
          </div>
        </section>

        {/* What Makes Us Different */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">What Makes Us Different</h2>
              <p className="text-[#A1A1AA] max-w-xl mx-auto">
                We didn't just start a shuttle company. We built a transportation experience.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {differentiators.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="glass rounded-2xl p-6 hover:border-[#7C3AED]/30 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center mb-4 group-hover:bg-[#7C3AED]/25 transition-colors">
                      <Icon className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                    <p className="text-[#A1A1AA] text-sm leading-relaxed">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Fleet Showcase */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-4">The Volt Way</h2>
              <p className="text-[#A1A1AA]">Black Mercedes Sprinter vans — the gold standard in group transportation.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: "Luxury Interior", src: "/images/van-luxury-interior.png", alt: "Plush leather interior of a Volt black Mercedes Sprinter van" },
                { label: "Luggage Capacity", src: "/images/van-luggage-capacity.png", alt: "Spacious luggage area of a Volt Mercedes Sprinter van" },
                { label: "Airport Pickup", src: "/images/chauffeur-passenger-boarding.png", alt: "A Volt chauffeur assisting a passenger boarding the shuttle" },
              ].map((item) => (
                <div key={item.label} className="glass rounded-2xl overflow-hidden relative aspect-video group">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/80 via-transparent to-transparent pointer-events-none" />
                  <span className="absolute bottom-4 left-4 text-white text-sm font-semibold">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to experience Volt?</h2>
            <p className="text-[#A1A1AA] mb-8">Book your Columbus to ATL shuttle in under 2 minutes.</p>
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
