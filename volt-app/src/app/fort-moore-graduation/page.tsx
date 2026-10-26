import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBookCTA from "@/components/ui/MobileBookCTA";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plane, Users, Car, Coffee, CalendarCheck, MapPin, Phone, Medal, Luggage } from "lucide-react";
import { getAppSettings } from "@/lib/settings-server";
import { dollars, type AppSettings } from "@/lib/settings";
import { displayTime12h } from "@/lib/booking";

// Search landing page for families flying into ATL for a Fort Moore (formerly Fort Benning)
// graduation — "fort moore graduation transportation", "atlanta airport to fort moore" and similar.
// Volt's prices, schedule and door-service fee come from Dashboard → Settings.
// Keep graduation-week details general: dates and times are set by the Army, not Volt.

const PAGE_URL = "https://volt-transportation.com/fort-moore-graduation";
// The /book form starts on ATL → Columbus round trip for this audience.
const BOOK_HREF = "/book?from=atl&to=columbus&roundTrip=true";

export async function generateMetadata(): Promise<Metadata> {
  const { pricing } = await getAppSettings();
  const description =
    `Flying into Atlanta for a Fort Moore graduation? Volt's shuttle meets you at Hartsfield-Jackson (ATL) and ` +
    `brings you to Columbus, GA — ${dollars(pricing.adult)} per adult, max 8 passengers per van, departures every day. ` +
    `Round trips back to ATL after the ceremony.`;
  return {
    title: "Fort Moore Graduation Transportation | Atlanta Airport (ATL) to Columbus Shuttle",
    description,
    keywords: [
      "Fort Moore graduation transportation",
      "Fort Benning graduation transportation",
      "Atlanta airport to Fort Moore",
      "ATL to Fort Moore shuttle",
      "Fort Moore graduation shuttle",
      "how to get to Fort Moore from Atlanta airport",
    ],
    alternates: { canonical: PAGE_URL },
    openGraph: {
      title: "Fort Moore Graduation Transportation from the Atlanta Airport | Volt Transportation",
      description,
      url: PAGE_URL,
      images: [{ url: "https://volt-transportation.com/images/volt-storefront-wide.jpg" }],
    },
  };
}

const faqFor = (s: AppSettings) => {
  const { toAtl, fromAtl } = s.schedule;
  const hours = Math.round((fromAtl.durationMinutes / 60) * 10) / 10;
  return [
    {
      question: "How do I get from the Atlanta airport to Fort Moore for graduation?",
      answer: `Ride Volt from Hartsfield-Jackson (ATL) to our lobby in Columbus, GA. Vans leave ATL from ${displayTime12h(fromAtl.first)} to ${displayTime12h(fromAtl.last)} every day, and the ride takes about ${hours} hours. Your driver meets you after baggage claim with a Volt sign.`,
    },
    {
      question: "Where does the shuttle drop us off in Columbus?",
      answer: `Every trip ends at Volt's lobby, ${s.business.street}, ${s.business.cityLine}. If you'd rather be dropped at your hotel or another address, call ${s.business.phone} to add a drop-off for ${dollars(s.doorService.dropoffCents / 100)}.`,
    },
    {
      question: "How much does it cost?",
      answer: `${dollars(s.pricing.adult)} per adult and ${dollars(s.pricing.child)} per child (ages 2–12), each way. There's no fuel surcharge and no service fee.`,
    },
    {
      question: "Can we ride back to the airport after the ceremony?",
      answer: `Yes. Book a round trip and pick your return van to ATL. Vans leave Columbus for ATL from ${displayTime12h(toAtl.first)} to ${displayTime12h(toAtl.last)} every day, and you can wait in our lounge until boarding.`,
    },
    {
      question: "Should we book ahead for graduation week?",
      answer: "Yes. Each van carries at most 8 passengers, and graduation weeks bring many families through ATL at the same time. Booking early is the best way to get the van that fits your flight.",
    },
    {
      question: "Does my new soldier get the Military Discount?",
      answer: s.military.enabled
        ? `Active-duty service members save ${dollars(s.military.amount)} on every booking with a verified military ID, so a soldier riding home on leave can use it. Family members booking for themselves don't qualify.`
        : "The Military Discount is paused right now. Check the Military page for updates.",
    },
  ];
};

function BookButton({ label = "Book Your Shuttle", className = "" }: { label?: string; className?: string }) {
  return (
    <Link href={BOOK_HREF} className={className}>
      <Button size="lg" className="group bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold px-8 py-6 text-base rounded-xl volt-glow">
        {label}
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </Link>
  );
}

export default async function FortMooreGraduationPage() {
  const s = await getAppSettings();
  const faq = faqFor(s);
  const { fromAtl } = s.schedule;
  const every = fromAtl.intervalMinutes % 60 === 0 ? `every ${fromAtl.intervalMinutes / 60 === 1 ? "hour" : `${fromAtl.intervalMinutes / 60} hours`}` : `every ${fromAtl.intervalMinutes} minutes`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://volt-transportation.com" },
          { "@type": "ListItem", position: 2, name: "Fort Moore Graduation Transportation", item: PAGE_URL },
        ],
      },
    ],
  };

  const steps = [
    { icon: Plane, title: "1. Land at ATL", desc: "Your driver meets you after baggage claim at Hartsfield-Jackson with a Volt sign. Add your flight number when you book." },
    { icon: MapPin, title: "2. Ride to Columbus", desc: `Relax for about ${Math.round((fromAtl.durationMinutes / 60) * 10) / 10} hours while we handle I-85 and I-185. We drop you at our Columbus lobby, or at your hotel if you add a drop-off.` },
    { icon: CalendarCheck, title: "3. Ride back after", desc: "Book a round trip and pick the van back to ATL that fits your flight home." },
  ];

  const features = [
    { icon: Users, title: "Room for the whole family", desc: "Never more than 8 passengers per Ford Transit Passenger Van, with space for everyone's bags." },
    { icon: Luggage, title: "Luggage help", desc: "Your driver loads and unloads your bags, and every rider gets complimentary bottled water." },
    { icon: Car, title: "No rental car needed", desc: "Skip the rental counter and the 100-mile drive after a long flight." },
    { icon: Coffee, title: "A lounge in Columbus", desc: "Wait inside our air-conditioned lounge before your van back to the airport." },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MobileBookCTA />
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#FCC300]/8 blur-[110px] pointer-events-none" />
          <div className="relative max-w-4xl mx-auto text-center">
            <p className="text-[#FCC300] text-sm font-semibold uppercase tracking-[0.2em] mb-4">Fort Moore Graduation</p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-6">
              Flying into Atlanta for a Fort Moore graduation?
            </h1>
            <p className="text-[#A1A1AA] text-lg max-w-2xl mx-auto mb-8">
              Volt picks you up at Hartsfield-Jackson Atlanta Airport (ATL) and brings you to Columbus, GA. Vans leave
              ATL {every} from {displayTime12h(fromAtl.first)} to {displayTime12h(fromAtl.last)}, every day of the week,
              for {dollars(s.pricing.adult)} per adult.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <BookButton />
              <a href={s.business.phoneHref} className="inline-flex items-center gap-2 text-white font-semibold hover:text-[#FCC300] transition-colors">
                <Phone className="w-4 h-4" /> Call {s.business.phone}
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">From the airport to graduation</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {steps.map((step) => (
                <div key={step.title} className="glass rounded-2xl p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-[#FCC300]/15 flex items-center justify-center mb-4">
                    <step.icon className="w-6 h-6 text-[#FCC300]" />
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planning */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-5">Planning your graduation trip</h2>
              <div className="space-y-4 text-[#A1A1AA] leading-relaxed">
                <p>
                  Graduation dates and ceremony times are set by the Army. Confirm them with your soldier or their unit
                  before you book flights, and leave time for Atlanta traffic on the way down.
                </p>
                <p>
                  Graduation weeks bring a lot of families through ATL at once, and each Volt van carries at most 8
                  passengers. Book your seats as soon as your flights are set.
                </p>
                <p>
                  Our vans end at Volt&apos;s lobby at {s.business.street}, {s.business.cityLine}. To be dropped at your
                  hotel instead, call {s.business.phone} and add a drop-off for {dollars(s.doorService.dropoffCents / 100)}.
                </p>
              </div>
              <BookButton label="Reserve Your Seats" className="inline-block mt-8" />
            </div>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] glass">
              <Image
                src="/images/chauffeur-passenger-boarding.png"
                alt="Volt Transportation driver helping a passenger board the shuttle"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* Why Volt */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">Why families ride with Volt</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {features.map((f) => (
                <div key={f.title} className="glass rounded-2xl p-6">
                  <f.icon className="w-6 h-6 text-[#FCC300] mb-4" />
                  <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
            {s.military.enabled && (
              <div className="mt-6 glass rounded-2xl p-6 border border-[#FCC300]/25 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <p className="text-white flex items-start gap-3">
                  <Medal className="w-5 h-5 text-[#FCC300] shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold text-[#FCC300]">New soldier heading home on leave?</span> Active-duty
                    service members save {dollars(s.military.amount)} on every booking.
                  </span>
                </p>
                <Link href="/military" className="shrink-0 text-[#FCC300] font-semibold hover:underline">Learn more →</Link>
              </div>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">Graduation travel FAQ</h2>
            <div className="space-y-3">
              {faq.map((f) => (
                <details key={f.question} className="glass rounded-xl px-5 py-4 group">
                  <summary className="text-white font-medium cursor-pointer list-none flex justify-between gap-4">
                    {f.question}
                    <span className="text-[#FCC300] group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed mt-3">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-3xl mx-auto text-center glass rounded-3xl px-8 py-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Congratulations to your soldier</h2>
            <p className="text-[#A1A1AA] mb-8">
              Book your ride from ATL to Columbus and back — {dollars(s.pricing.adult)} per adult, no fuel surcharge, no hidden fees.
            </p>
            <BookButton label="Book Your Ride" />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
