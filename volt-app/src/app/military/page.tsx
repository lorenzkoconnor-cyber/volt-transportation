import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Clock,
  ExternalLink,
  HeartHandshake,
  Medal,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { MILITARY_DISCOUNT_PERCENT, PRICING } from "@/lib/booking";
import { DONATION_PARTNER, DONATION_PERCENT_OF_PROFITS } from "@/lib/military";

export const metadata: Metadata = {
  title: "Military Discount & Giving Back",
  description: `Active-duty and retired military save ${MILITARY_DISCOUNT_PERCENT}% on every Volt shuttle booking between Columbus, GA and ATL. Volt donates ${DONATION_PERCENT_OF_PROFITS}% of its profits to ${DONATION_PARTNER.name}.`,
  alternates: { canonical: "https://volt-transportation.com/military" },
};

const eligible = [
  { title: "Active-duty military", desc: "Currently serving on active duty in the U.S. Armed Forces." },
  { title: "Retired military", desc: "Retired from the U.S. Armed Forces." },
];

const steps = [
  {
    icon: ShieldCheck,
    title: "Tick the box at checkout",
    desc: "When you book, check “I’m active-duty or retired military.” You can also submit from your account profile any time.",
  },
  {
    icon: Upload,
    title: "Upload your military ID",
    desc: "A clear photo or scan of your active-duty or retiree ID. It’s stored privately and only used to confirm eligibility.",
  },
  {
    icon: Clock,
    title: "We review it",
    desc: `Our team checks your ID. Your first booking places a hold on your card for the regular fare — once you’re approved we charge only ${100 - MILITARY_DISCOUNT_PERCENT}% of it. If we can’t verify your eligibility, the regular fare is charged.`,
  },
  {
    icon: BadgeCheck,
    title: "Verified once, saved every time",
    desc: `Once approved, ${MILITARY_DISCOUNT_PERCENT}% comes off automatically every time you book while signed in — no codes, no re-uploading.`,
  },
];

const ranchPrograms = [
  "Equine programs",
  "Veterans Helping Veterans — help with essential services, home repairs, labor, and supplies",
  "Food distribution",
  "Operation Song",
];

const faqs = [
  {
    q: "What does the discount apply to?",
    a: `Your whole booking — every passenger on the reservation, pets, extra bags, and both legs of a round trip.`,
  },
  {
    q: "I served but didn’t retire. Do I qualify?",
    a: "Not at this time. The discount is for active-duty service members and military retirees. We’re grateful for your service, and every ride you take with Volt still helps support veterans through our donations.",
  },
  {
    q: "Can I use it as a guest without an account?",
    a: "Yes, you can upload your ID during guest checkout. To get the discount automatically on later trips, book while signed in with the same email address.",
  },
  {
    q: "How do the donations work?",
    a: `Volt donates ${DONATION_PERCENT_OF_PROFITS}% of its profits to ${DONATION_PARTNER.name}. The donation comes from Volt’s profits, not from your discount. Every rider helps support veterans simply by riding with us.`,
  },
];

// Example uses one adult round trip, so the numbers on this page always match live pricing.
const exampleFare = PRICING.adult * 2;
const exampleSavings = (exampleFare * MILITARY_DISCOUNT_PERCENT) / 100;

export default function MilitaryPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-1/4 w-[500px] h-[400px] rounded-full bg-[#FCC300]/8 blur-[120px] pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-6">
              <Medal className="w-3.5 h-3.5 text-[#FCC300]" />
              <span className="text-[#A1A1AA] text-xs font-medium">Military Discount &amp; Giving Back</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6">
              Honoring those who serve.<br />
              <span className="gradient-text-volt">Supporting those who served.</span>
            </h1>
            <p className="text-[#A1A1AA] text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              Active-duty and retired military save {MILITARY_DISCOUNT_PERCENT}% on every Volt ride. And every
              ride, military or not, helps veterans: Volt donates {DONATION_PERCENT_OF_PROFITS}% of its profits
              to {DONATION_PARTNER.name}.
            </p>
          </div>
        </section>

        {/* At a glance */}
        <section className="pb-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { big: `${MILITARY_DISCOUNT_PERCENT}%`, label: "off every booking", sub: "Active-duty & retired military" },
              { big: `${DONATION_PERCENT_OF_PROFITS}%`, label: "of Volt’s profits donated", sub: "To support local veterans" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl p-6 text-center">
                <div className="text-[#FCC300] text-4xl font-bold mb-1">{s.big}</div>
                <div className="text-white font-semibold">{s.label}</div>
                <div className="text-[#A1A1AA] text-sm mt-1">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Who qualifies */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Who Qualifies</h2>
              <p className="text-[#A1A1AA] max-w-xl mx-auto">
                The {MILITARY_DISCOUNT_PERCENT}% Military Discount is for active-duty service members and military
                retirees, verified with a military ID.
              </p>
            </div>
            <div className="max-w-xl mx-auto">
              <div className="glass rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-400" /> Eligible
                </h3>
                <ul className="space-y-4">
                  {eligible.map((e) => (
                    <li key={e.title} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-green-400" />
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium">{e.title}</div>
                        <div className="text-[#A1A1AA] text-sm">{e.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How to get it */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">How to Get Your Discount</h2>
              <p className="text-[#A1A1AA] max-w-xl mx-auto">
                Verify once and the discount is applied for you on every future booking.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="glass rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[#FCC300]/15 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[#FCC300]" />
                      </div>
                      <span className="text-[#A1A1AA] text-xs font-medium">Step {i + 1}</span>
                    </div>
                    <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                    <p className="text-[#A1A1AA] text-sm leading-relaxed">{step.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 glass rounded-2xl p-6 max-w-2xl mx-auto">
              <div className="text-white font-semibold mb-3">Example</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#A1A1AA]">1 adult, round trip (2 × ${PRICING.adult})</span>
                  <span className="text-white">${exampleFare}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">Military Discount (−{MILITARY_DISCOUNT_PERCENT}%)</span>
                  <span className="text-green-400">−${exampleSavings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-white/10 pt-2">
                  <span className="text-white">You pay</span>
                  <span className="text-[#FCC300]">${(exampleFare - exampleSavings).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Giving back */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-5">
                <HeartHandshake className="w-3.5 h-3.5 text-[#FCC300]" />
                <span className="text-[#A1A1AA] text-xs font-medium">Giving Back</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-5">
                {DONATION_PERCENT_OF_PROFITS}% of our profits go to veterans.
              </h2>
              <p className="text-[#A1A1AA] leading-relaxed mb-4">
                Volt donates {DONATION_PERCENT_OF_PROFITS}% of its profits to {DONATION_PARTNER.name}. That means
                every trip you take with us, whether or not you use the Military Discount, helps support veterans,
                service members, and their families in our community.
              </p>
              <p className="text-[#A1A1AA] leading-relaxed">
                We chose a local partner on purpose. Supporting an organization that serves veterans and families
                around Columbus and Fortson makes this commitment personal for us.
              </p>
            </div>

            <div className="glass rounded-2xl p-6 sm:p-8">
              <h3 className="text-white font-bold text-xl mb-1">Who We Support</h3>
              <p className="text-[#FCC300] text-sm font-medium mb-4">
                {DONATION_PARTNER.name} · {DONATION_PARTNER.location}
              </p>
              <p className="text-[#A1A1AA] text-sm leading-relaxed mb-4">
                {DONATION_PARTNER.name} is a nonprofit that helps veterans, service members, and their families
                move into a fulfilling life after the challenges of military service. Its programs build connection,
                healing, confidence, and family support, and they cost veterans and their families nothing.
              </p>
              <div className="text-white text-sm font-medium mb-2">Programs include</div>
              <ul className="space-y-2 mb-6">
                {ranchPrograms.map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#FCC300] flex-shrink-0 mt-0.5" />
                    <span className="text-[#A1A1AA] text-sm">{p}</span>
                  </li>
                ))}
              </ul>
              <a
                href={DONATION_PARTNER.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[#FCC300] text-sm font-medium hover:underline"
              >
                Visit {DONATION_PARTNER.displayUrl}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">Common Questions</h2>
            <div className="space-y-4">
              {faqs.map((f) => (
                <div key={f.q} className="glass rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-2">{f.q}</h3>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Thank you for your service.</h2>
            <p className="text-[#A1A1AA] mb-8">
              Book your ride and select the Military Discount at checkout.
            </p>
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
