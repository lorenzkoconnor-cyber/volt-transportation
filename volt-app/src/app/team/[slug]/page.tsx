import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import Logo from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { getAppSettings } from "@/lib/settings-server";
import { TEAM, teamMember, cardUrl, bookUrl, SITE_URL } from "@/lib/team";
import PrintCardButton from "./PrintCardButton";
import { ArrowRight, Contact, Globe, Mail, MapPin, MessageSquare, Phone, Star } from "lucide-react";

// A team member's digital business card. Reached from the Contact page or a
// shared link / QR code, so it's kept out of search results. "Print cards"
// prints a Letter sheet of ten 3.5" × 2" cards (Avery 8371 layout).

export const dynamicParams = false;

export function generateStaticParams() {
  return TEAM.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = teamMember(slug);
  if (!m) return {};
  return {
    title: `${m.name}, ${m.title}`,
    description: `${m.name}, ${m.title} at Volt Transportation, the Columbus, GA shuttle to Atlanta Airport (ATL).`,
    robots: { index: false, follow: true },
    openGraph: { images: [{ url: m.photo.src }] },
  };
}

const GOOGLE_REVIEWS_FALLBACK = "https://www.google.com/search?q=Volt+Transportation+Columbus+GA+reviews";

export default async function TeamCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = teamMember(slug);
  if (!m) notFound();

  const { business: b, reviews } = await getAppSettings();
  const qrSvg = await QRCode.toString(cardUrl(m, "qr"), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0A0A0A", light: "#FFFFFF" },
  });
  const sms = b.phoneHref.replace("tel:", "sms:");
  const reviewUrl = reviews.googleUrl ?? GOOGLE_REVIEWS_FALLBACK;

  return (
    <>
      <main className="screen-only flex-1 pb-16">
        <header className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/" aria-label="Volt Transportation home">
            <Logo className="h-9 w-auto" priority />
          </Link>
          <Link href="/" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
            volt-transportation.com
          </Link>
        </header>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <div className="absolute -top-10 right-0 w-[360px] h-[260px] bg-[#FCC300]/8 blur-[100px] pointer-events-none" />

          {/* Card */}
          <section className="glass rounded-3xl p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-6 sm:gap-8 items-center">
            <div className="relative aspect-[3/4] w-full max-w-[260px] mx-auto sm:max-w-none rounded-2xl overflow-hidden bg-[#171717]">
              <Image src={m.photo.src} alt={m.photo.alt} fill priority sizes="260px" className="object-cover" />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{m.name}</h1>
              <p className="text-[#FCC300] font-semibold text-lg mt-1">{m.title}</p>
              <p className="text-[#A1A1AA] text-sm mt-1">Volt Transportation · Columbus, GA ⇄ ATL</p>

              <div className="grid grid-cols-3 gap-2 mt-6">
                {[
                  { href: b.phoneHref, icon: Phone, label: "Call" },
                  { href: sms, icon: MessageSquare, label: "Text" },
                  { href: `mailto:${m.email}`, icon: Mail, label: "Email" },
                ].map(({ href, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#FCC300]/50 py-3 text-sm text-white transition-colors"
                  >
                    <Icon className="w-5 h-5 text-[#FCC300]" />
                    {label}
                  </a>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <Link href={bookUrl(m)}>
                  <Button className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-12 rounded-xl">
                    Book a Ride <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <a href={`/team/${m.slug}/vcard`} download={`${m.name} - Volt Transportation.vcf`}>
                  <Button variant="outline" className="w-full h-12 rounded-xl border-white/15 text-white hover:bg-white/5">
                    <Contact className="w-4 h-4 mr-1" /> Save Contact
                  </Button>
                </a>
              </div>
            </div>
          </section>

          {/* Details */}
          <section className="glass rounded-2xl p-6 mt-5 space-y-3 text-sm">
            <a href={b.phoneHref} className="flex items-center gap-3 text-[#A1A1AA] hover:text-white transition-colors">
              <Phone className="w-4 h-4 text-[#FCC300] shrink-0" /> {b.phone}
            </a>
            <a href={`mailto:${m.email}`} className="flex items-center gap-3 text-[#A1A1AA] hover:text-white transition-colors break-all">
              <Mail className="w-4 h-4 text-[#FCC300] shrink-0" /> {m.email}
            </a>
            <p className="flex items-center gap-3 text-[#A1A1AA]">
              <MapPin className="w-4 h-4 text-[#FCC300] shrink-0" /> {b.street}, {b.cityLine}
            </p>
            <Link href="/" className="flex items-center gap-3 text-[#A1A1AA] hover:text-white transition-colors">
              <Globe className="w-4 h-4 text-[#FCC300] shrink-0" /> volt-transportation.com
            </Link>
          </section>

          {/* About */}
          <section className="glass rounded-2xl p-6 mt-5">
            <h2 className="text-white font-semibold text-lg mb-3">About {m.name}</h2>
            <div className="space-y-3 text-[#A1A1AA] leading-relaxed">
              {m.bio.map((p) => <p key={p}>{p}</p>)}
            </div>
            {m.askMeAbout.length > 0 && (
              <>
                <h3 className="text-white font-semibold text-sm mt-5 mb-2">Ask me about</h3>
                <ul className="flex flex-wrap gap-2">
                  {m.askMeAbout.map((t) => (
                    <li key={t} className="text-xs text-[#FCC300] bg-[#FCC300]/10 border border-[#FCC300]/20 rounded-full px-3 py-1">{t}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* On the job */}
          {m.gallery.length > 0 && (
            <section className="mt-5">
              <h2 className="text-white font-semibold text-lg mb-3">On the job</h2>
              <div className={`grid gap-3 ${m.gallery.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                {m.gallery.map((p, i) => (
                  <div
                    key={p.src}
                    className={`relative aspect-[3/2] rounded-2xl overflow-hidden bg-[#171717] ${m.gallery.length === 3 && i === 0 ? "sm:col-span-2" : ""}`}
                  >
                    <Image src={p.src} alt={p.alt} fill sizes="(max-width: 640px) 100vw, 720px" className="object-cover" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Share + review */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
            <div className="glass rounded-2xl p-6 flex flex-col items-center text-center">
              <h2 className="text-white font-semibold mb-1">Share this card</h2>
              <p className="text-[#A1A1AA] text-sm mb-4">Scan to open {m.name}&rsquo;s card on your phone.</p>
              <div
                className="w-40 h-40 bg-white rounded-xl p-3 [&_svg]:w-full [&_svg]:h-full"
                role="img"
                aria-label={`QR code for ${SITE_URL}/team/${m.slug}`}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <PrintCardButton />
            </div>
            <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <Star className="w-8 h-8 text-[#FCC300] mb-3" />
              <h2 className="text-white font-semibold mb-1">Rode with us?</h2>
              <p className="text-[#A1A1AA] text-sm mb-4">A quick Google review helps other Columbus travelers find Volt.</p>
              <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                <Button variant="outline" className="w-full h-11 rounded-xl border-[#FCC300]/40 text-[#FCC300] hover:bg-[#FCC300]/10">
                  Leave a Review
                </Button>
              </a>
            </div>
          </section>

          <div className="text-center mt-10">
            <Link href="/" className="inline-flex items-center gap-2 text-[#A1A1AA] hover:text-white text-sm transition-colors">
              Visit the Volt Transportation homepage <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      {/* Printed business cards: ten per Letter sheet, Avery 8371 positions. */}
      <div className="print-sheet" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="print-card">
            <div className="print-card-info">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/volt-logo.png" alt="" className="print-card-logo" />
              <p className="print-card-name">{m.name}</p>
              <p className="print-card-title">{m.title}</p>
              <p className="print-card-line">{b.phone}</p>
              <p className="print-card-line">{m.email}</p>
              <p className="print-card-line">volt-transportation.com</p>
            </div>
            <div className="print-card-qr">
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <p>Scan to book</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
