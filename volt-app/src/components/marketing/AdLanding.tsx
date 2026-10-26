import Link from "next/link";
import Image from "next/image";
import Logo from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Car, Clock, Luggage, MapPin, Phone, Plane } from "lucide-react";
import type { AppSettings } from "@/lib/settings";
import { dollars } from "@/lib/settings";
import { displayTime12h } from "@/lib/booking";

// Short, phone-first page for paid social ads. Each ad lands on the page that
// matches its image and headline, so the visitor sees the same promise they
// tapped on, the price and a button into /book within one screen.
// The ad's utm_* tags are remembered by <GoogleTag /> (attribution.ts), so
// /book links here don't need to carry them.

// Columbus → ATL, the direction the ads sell.
const BOOK_HREF = "/book?from=columbus&to=atl";

export interface AdLandingCopy {
  eyebrow: string;
  headline: string;
  subhead: string;
  image: { src: string; alt: string };
}

function BookButton({ label }: { label: string }) {
  return (
    <Link href={BOOK_HREF} className="block w-full sm:w-auto">
      <Button size="lg" className="group w-full sm:w-auto bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold px-8 py-6 text-base rounded-xl volt-glow">
        {label}
        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Button>
    </Link>
  );
}

export default function AdLanding({ copy, settings: s }: { copy: AdLandingCopy; settings: AppSettings }) {
  const { toAtl } = s.schedule;
  const hours = Math.round((toAtl.durationMinutes / 60) * 10) / 10;
  const every = toAtl.intervalMinutes % 60 === 0
    ? `Every ${toAtl.intervalMinutes / 60 === 1 ? "hour" : `${toAtl.intervalMinutes / 60} hours`}`
    : `Every ${toAtl.intervalMinutes} minutes`;

  const facts = [
    { icon: Clock, title: `${every}, 7 days a week`, desc: `Vans leave Columbus from ${displayTime12h(toAtl.first)} to ${displayTime12h(toAtl.last)}. Pick the one that fits your flight.` },
    { icon: Car, title: "Free parking in Columbus", desc: `Leave your car at our lobby, ${s.business.street}, for as long as you're gone.` },
    { icon: Plane, title: "Dropped at your terminal", desc: `About ${hours} hours to Hartsfield-Jackson (ATL), and someone else drives.` },
    { icon: Luggage, title: "Luggage help, max 8 riders", desc: "Your driver loads your bags. Never more than 8 passengers per van." },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <Link href="/" aria-label="Volt Transportation home">
          <Logo className="h-8 w-auto" priority />
        </Link>
        <a href={s.business.phoneHref} className="inline-flex items-center gap-2 text-sm text-white font-semibold hover:text-[#FCC300]">
          <Phone className="w-4 h-4" /> {s.business.phone}
        </a>
      </header>

      <main>
        {/* Hero: the ad's promise, the price and the button, all in the first screen on a phone. */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div className="relative aspect-[16/9] lg:aspect-[4/3] rounded-2xl overflow-hidden lg:order-2">
            <Image src={copy.image.src} alt={copy.image.alt} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
          <div>
            <p className="text-[#FCC300] text-xs font-semibold uppercase tracking-[0.2em] mb-3">{copy.eyebrow}</p>
            <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-4">{copy.headline}</h1>
            <p className="text-[#A1A1AA] text-base sm:text-lg mb-5">{copy.subhead}</p>
            <p className="text-white mb-6">
              <span className="text-4xl font-bold text-[#FCC300]">{dollars(s.pricing.adult)}</span>
              <span className="text-[#A1A1AA]"> per adult, each way · {dollars(s.pricing.child)} kids 2–12 · no fuel surcharge</span>
            </p>
            <BookButton label="See Departure Times" />
            <p className="text-[#71717A] text-sm mt-3">
              Questions? Call <a href={s.business.phoneHref} className="text-white underline-offset-2 hover:underline">{s.business.phone}</a>.
            </p>
          </div>
        </section>

        <section className="bg-[#111111] px-4 sm:px-6 py-12">
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            {facts.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-5 flex gap-4">
                <f.icon className="w-6 h-6 text-[#FCC300] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-white font-semibold mb-1">{f.title}</h2>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 sm:px-6 py-12">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-white text-lg font-semibold mb-2 flex items-center justify-center gap-2">
              <MapPin className="w-5 h-5 text-[#FCC300]" /> {s.business.street}, {s.business.cityLine}
            </p>
            <p className="text-[#A1A1AA] text-sm mb-6">Round trips back from ATL are available when you book.</p>
            <BookButton label="Book Your Seat" />
          </div>
        </section>
      </main>
    </div>
  );
}
