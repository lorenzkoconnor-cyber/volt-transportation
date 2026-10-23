import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBookCTA from "@/components/ui/MobileBookCTA";
import GoogleMapsButton from "@/components/ui/GoogleMapsButton";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Plane, Users, Shield, Clock, Car, Coffee, Luggage, CalendarCheck, MapPin, Phone,
} from "lucide-react";
import { getAppSettings } from "@/lib/settings-server";
import { dollars, type AppSettings } from "@/lib/settings";
import { displayTime12h } from "@/lib/booking";

// Search landing page for people who don't know Volt yet — "airport shuttle",
// "Columbus GA to Atlanta airport", "shuttle to ATL" and similar searches.
// Volt's prices and schedule come from Dashboard → Settings.
//
// "Other Competitors" figures are Groome Transportation's, from
// groometransportation.com/columbus as checked on COMPETITOR_CHECKED. The owner
// asked not to name them on the page. Re-check before changing this table — comparative
// claims about a named competitor must stay accurate.

const PAGE_URL = "https://volt-transportation.com/airport-shuttle-service";
const COMPETITOR_CHECKED = "October 23, 2026";
const COMPETITOR = {
  adultOnline: 59,
  adultOther: 69,
  child: 45,
  pet: 19,
  fuelSurcharge: 2,
  hotelExtra: 10,
};

export async function generateMetadata(): Promise<Metadata> {
  const { pricing } = await getAppSettings();
  const description =
    `Airport shuttle service from Columbus, GA to Atlanta Hartsfield-Jackson Airport (ATL). ` +
    `${dollars(pricing.adult)} per adult, no fuel surcharge, max 8 passengers per van, free parking and a ` +
    `private lounge. Serving Columbus, Fort Benning, Phenix City and Auburn. Book online in 2 minutes.`;
  return {
    title: "Airport Shuttle Service | Columbus GA to Atlanta Airport (ATL)",
    description,
    keywords: [
      "airport shuttle service",
      "Columbus GA airport shuttle",
      "Columbus to Atlanta airport shuttle",
      "shuttle from Columbus GA to Atlanta airport",
      "ATL airport shuttle",
      "Hartsfield-Jackson shuttle",
      "Fort Benning airport shuttle",
      "Phenix City to Atlanta airport",
      "Auburn to Atlanta airport shuttle",
      "airport transportation Columbus GA",
    ],
    alternates: { canonical: PAGE_URL },
    openGraph: {
      title: "Columbus GA to Atlanta Airport Shuttle Service | Volt Transportation",
      description,
      url: PAGE_URL,
      images: [{ url: "https://volt-transportation.com/images/volt-storefront-wide.jpg" }],
    },
  };
}

const faqFor = (s: AppSettings) => {
  const { toAtl, fromAtl } = s.schedule;
  const every = toAtl.intervalMinutes % 60 === 0 ? `every ${toAtl.intervalMinutes / 60 === 1 ? "hour" : `${toAtl.intervalMinutes / 60} hours`}` : `every ${toAtl.intervalMinutes} minutes`;
  return [
    {
      question: "How much is the airport shuttle from Columbus, GA to Atlanta airport?",
      answer: `A one-way seat on Volt's Columbus to ATL airport shuttle is ${dollars(s.pricing.adult)} per adult and ${dollars(s.pricing.child)} per child (ages 2–12). There is no fuel surcharge and no service fee — the price you see is the price you pay.`,
    },
    {
      question: "How long is the shuttle ride from Columbus to Hartsfield-Jackson Atlanta Airport?",
      answer: `About ${Math.round(toAtl.durationMinutes / 60 * 10) / 10} hours. The route is roughly 100 miles up I-185 and I-85 to the domestic terminal curb at ATL.`,
    },
    {
      question: "What times does the shuttle leave for the Atlanta airport?",
      answer: `Volt departs Columbus for ATL ${every} from ${displayTime12h(toAtl.first)} to ${displayTime12h(toAtl.last)}, and leaves ATL for Columbus from ${displayTime12h(fromAtl.first)} to ${displayTime12h(fromAtl.last)}, every day.`,
    },
    {
      question: "Where do I catch the airport shuttle in Columbus?",
      answer: `Every Volt trip leaves from our lobby at ${s.business.street}, ${s.business.cityLine}. Parking is free, and you can wait inside our lounge until boarding. Please arrive ${s.arriveEarlyMinutes} minutes early.`,
    },
    {
      question: "Is there an airport shuttle from Fort Benning, Phenix City or Auburn to ATL?",
      answer: `Yes — riders from Fort Benning, Phenix City, Auburn, Opelika, Harris County and LaGrange drive to our Columbus lobby, park free, and ride Volt to the Atlanta airport. ${s.military.enabled ? `Active-duty and retired military save ${dollars(s.military.amount)} on every booking.` : ""}`.trim(),
    },
    {
      question: "Where does the shuttle pick me up at the Atlanta airport?",
      answer: "Your driver meets you in the ground transportation area after baggage claim at Hartsfield-Jackson, holding a Volt sign. We track your flight, so tell us your flight number when you book.",
    },
    {
      question: "Do I need to book the airport shuttle in advance?",
      answer: `Booking ahead is the best way to guarantee your seat, since each van carries at most 8 passengers. You can book online up to ${Math.round(s.onlineCutoffMinutes / 60)} hours before departure, or call ${s.business.phone}.`,
    },
  ];
};

const jsonLdFor = (s: AppSettings, faq: ReturnType<typeof faqFor>) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "@id": `${PAGE_URL}#service`,
      name: "Columbus GA to Atlanta Airport Shuttle Service",
      serviceType: "Airport shuttle service",
      provider: { "@id": "https://volt-transportation.com/#business" },
      areaServed: ["Columbus, GA", "Fort Benning, GA", "Phenix City, AL", "Auburn, AL", "Atlanta, GA"].map((name) => ({ "@type": "Place", name })),
      offers: {
        "@type": "Offer",
        price: String(s.pricing.adult),
        priceCurrency: "USD",
        url: "https://volt-transportation.com/book",
        description: "Adult one-way airport shuttle seat, Columbus GA ⇄ ATL",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://volt-transportation.com" },
        { "@type": "ListItem", position: 2, name: "Airport Shuttle Service", item: PAGE_URL },
      ],
    },
  ],
});

function BookButton({ label = "Book Your Shuttle", className = "" }: { label?: string; className?: string }) {
  return (
    <Link href="/book" className={className}>
      <Button size="lg" className="group bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold px-8 py-6 text-base rounded-xl volt-glow">
        {label}
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </Link>
  );
}

export default async function AirportShuttleServicePage() {
  const s = await getAppSettings();
  const faq = faqFor(s);
  const P = s.pricing;
  const { toAtl } = s.schedule;
  const hours = toAtl.durationMinutes / 60;
  const driveTime = Number.isInteger(hours) ? `${hours} hours` : `${Math.floor(hours)} hr ${toAtl.durationMinutes % 60} min`;
  const every = toAtl.intervalMinutes % 60 === 0 ? `Every ${toAtl.intervalMinutes / 60 === 1 ? "hour" : `${toAtl.intervalMinutes / 60} hours`}` : `Every ${toAtl.intervalMinutes} min`;

  const features = [
    { icon: Users, title: "Never more than 8 passengers", desc: "Every van is a Ford Transit Passenger Van capped at 8 riders, so you get a real seat and room for your bags — not a packed bus." },
    { icon: Car, title: "Free parking in Columbus", desc: `Leave your car at our lobby on ${s.business.street.split(",")[0]} for free instead of paying for airport parking in Atlanta.` },
    { icon: Coffee, title: "A lounge, not a curb", desc: "Wait inside our air-conditioned passenger lounge with seating and a TV until it's time to board." },
    { icon: Luggage, title: "Luggage help & bottled water", desc: "Your driver loads and unloads your bags, and every rider gets complimentary bottled water." },
    { icon: Plane, title: "Flight-based return pickups", desc: "Tell us your flight number and your driver meets you after baggage claim at Hartsfield-Jackson with a Volt sign." },
    { icon: Shield, title: "Professional drivers", desc: "Background-checked, chauffeur-style drivers focused on getting you to your flight safely and on time." },
  ];

  // [label, Volt, other competitors]
  const rows: [string, string, string][] = [
    ["Adult one-way fare", `${dollars(P.adult)} — same price online, by phone or walk-up`, `${dollars(COMPETITOR.adultOnline)} online, ${dollars(COMPETITOR.adultOther)} otherwise`],
    ["Child one-way fare", `${dollars(P.child)} (ages 2–12)`, `${dollars(COMPETITOR.child)} (12 & under)`],
    ["Pet fare", dollars(P.pet), dollars(COMPETITOR.pet)],
    ["Fuel surcharge", "None", `${dollars(COMPETITOR.fuelSurcharge)} per passenger (since May 5, 2026)`],
    ["Fare changes by date or time", "No — one fixed price", "Yes — “fares may fluctuate based on the exact date and time”"],
    ["Passengers per vehicle", "Max 8 in a Ford Transit Passenger Van", "Not published"],
    ["Columbus pickup", `Volt's own lobby at ${s.business.street} with free parking`, `Their own office; downtown hotel stops are by reservation, no parking, +${dollars(COMPETITOR.hotelExtra)}`],
    ["Indoor passenger lounge", "Yes", "Not advertised"],
    ["Bottled water & luggage help", "Included", "Not advertised"],
    ["Departures to ATL", `${every}, ${displayTime12h(toAtl.first)}–${displayTime12h(toAtl.last)} daily`, "About hourly, per its posted timetable"],
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFor(s, faq)) }} />
      <MobileBookCTA />
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#FCC300]/8 blur-[110px] pointer-events-none" />
          <div className="relative max-w-4xl mx-auto text-center">
            <p className="text-[#FCC300] text-sm font-semibold uppercase tracking-[0.2em] mb-4">Airport Shuttle Service</p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-6">
              Columbus, GA to Atlanta Airport (ATL) Shuttle
            </h1>
            <p className="text-[#A1A1AA] text-lg max-w-2xl mx-auto mb-8">
              Skip the 100-mile drive and the airport parking bill. Volt Transportation runs a premium airport shuttle
              between Columbus, Georgia and Hartsfield-Jackson Atlanta International Airport — {dollars(P.adult)} a seat,
              never more than 8 passengers, every day of the week.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <BookButton />
              <a href={s.business.phoneHref} className="inline-flex items-center gap-2 text-white font-semibold hover:text-[#FCC300] transition-colors">
                <Phone className="w-4 h-4" /> Call {s.business.phone}
              </a>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-3 max-w-xl mx-auto">
              {[
                { value: dollars(P.adult), label: "per adult, one way" },
                { value: driveTime, label: "Columbus → ATL" },
                { value: "8 max", label: "riders per van" },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-xl px-3 py-4">
                  <div className="text-white font-bold text-xl sm:text-2xl">{stat.value}</div>
                  <div className="text-[#A1A1AA] text-xs mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Intro — for people searching for a way to the airport */}
        <section className="pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-5">The easy way to get from Columbus to the Atlanta airport</h2>
              <div className="space-y-4 text-[#A1A1AA] leading-relaxed">
                <p>
                  Whether you&apos;re flying out of ATL for work, a family vacation or a military PCS move, getting to
                  Hartsfield-Jackson from Columbus usually means a two-hour drive, Atlanta traffic and a week of airport
                  parking fees. An airport shuttle takes all of that off your plate.
                </p>
                <p>
                  Volt&apos;s Columbus airport shuttle leaves from one place — our lobby at {s.business.street},{" "}
                  {s.business.cityLine} — and drops you at the domestic terminal curb. On the way home, your driver meets
                  you after baggage claim and brings you back to your car.
                </p>
                <p>
                  Travelers from Fort Benning, Phenix City, Auburn, Opelika, Harris County and LaGrange use Volt as their
                  ride to the Atlanta airport too: park free in Columbus, relax in our lounge, and let us handle I-185 and I-85.
                </p>
              </div>
              <BookButton label="Reserve Your Seat" className="inline-block mt-8" />
            </div>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] glass">
              <Image
                src="/images/chauffeur-passenger-boarding.png"
                alt="Volt Transportation driver helping a passenger board the Columbus to Atlanta airport shuttle"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">How our airport shuttle works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: CalendarCheck, title: "1. Book online", desc: "Pick your departure, add your flight number, and pay in about 2 minutes. No account needed." },
                { icon: MapPin, title: "2. Arrive in Columbus", desc: `Park free at our lobby ${s.arriveEarlyMinutes} minutes before departure and wait in the lounge.` },
                { icon: Plane, title: "3. Ride to ATL", desc: `About ${driveTime} later you're at the Hartsfield-Jackson terminal curb, bags unloaded for you.` },
              ].map((step) => (
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

        {/* Why Volt */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-3">Why riders choose Volt for airport transportation</h2>
            <p className="text-[#A1A1AA] text-center max-w-2xl mx-auto mb-12">
              A smaller, more comfortable shuttle from Columbus to Atlanta Hartsfield-Jackson.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <p className="text-white">
                  <span className="font-semibold text-[#FCC300]">Military riders:</span> active-duty and retired service members save{" "}
                  {dollars(s.military.amount)} on every booking, and Volt donates {dollars(s.military.amount)} to Warrior Outreach Ranch for each one.
                </p>
                <Link href="/military" className="shrink-0 text-[#FCC300] font-semibold hover:underline">Learn more →</Link>
              </div>
            )}
          </div>
        </section>

        {/* Comparison */}
        <section id="compare" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-3">Volt vs. Other Competitors</h2>
            <p className="text-[#A1A1AA] text-center max-w-2xl mx-auto mb-10">
              Comparing Columbus to Atlanta airport shuttles? Here&apos;s how Volt stacks up side by side.
            </p>
            <div className="glass rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th scope="col" className="text-left text-[#A1A1AA] font-medium px-5 py-4 w-1/4"><span className="sr-only">Feature</span></th>
                      <th scope="col" className="text-left px-5 py-4 bg-[#FCC300]/10 w-[37.5%]">
                        <span className="text-[#FCC300] font-bold text-base">Volt Transportation</span>
                      </th>
                      <th scope="col" className="text-left px-5 py-4 text-white font-bold text-base w-[37.5%]">Other Competitors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rows.map(([label, volt, other]) => (
                      <tr key={label}>
                        <th scope="row" className="text-left text-white font-medium px-5 py-4 align-top">{label}</th>
                        <td className="px-5 py-4 bg-[#FCC300]/5 text-white align-top">{volt}</td>
                        <td className="px-5 py-4 text-[#A1A1AA] align-top">{other}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[#71717A] text-xs mt-4 leading-relaxed">
              Competitor details are from a competing Columbus–Atlanta airport shuttle&apos;s published fares and schedule as of{" "}
              {COMPETITOR_CHECKED} and may change; &ldquo;not published&rdquo; and &ldquo;not advertised&rdquo; mean we couldn&apos;t
              find it on their website.
            </p>
            <div className="text-center mt-10">
              <BookButton label="Book Volt Instead" />
            </div>
          </div>
        </section>

        {/* Where to find us */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Columbus airport shuttle pickup location</h2>
            <p className="text-[#A1A1AA] mb-8 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" /> Hours: {s.business.hours}
            </p>
            <GoogleMapsButton address={`${s.business.street}, ${s.business.cityLine}`} />
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">Airport shuttle FAQ</h2>
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
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center glass rounded-3xl px-8 py-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Your ride to ATL is 2 minutes away</h2>
            <p className="text-[#A1A1AA] mb-8">
              Book your Columbus to Atlanta airport shuttle now — {dollars(P.adult)} per adult, no fuel surcharge, no hidden fees.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <BookButton label="Book Your Ride" />
              <Link href="/pricing" className="text-white font-semibold hover:text-[#FCC300] transition-colors">See all pricing →</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
