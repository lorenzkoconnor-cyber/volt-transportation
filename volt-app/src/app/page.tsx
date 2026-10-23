import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import WhyVolt from "@/components/home/WhyVolt";
import PricingSection from "@/components/home/PricingSection";
import ReviewsSection from "@/components/home/ReviewsSection";
import LobbyGallery from "@/components/home/LobbyGallery";
import FAQSection from "@/components/home/FAQSection";
import CTASection from "@/components/home/CTASection";
import MobileBookCTA from "@/components/ui/MobileBookCTA";
import { getAppSettings } from "@/lib/settings-server";
import { dollars, type AppSettings } from "@/lib/settings";
import { faqItems, GOOGLE_MAPS_URL } from "@/lib/site-copy";

export async function generateMetadata(): Promise<Metadata> {
  const { pricing } = await getAppSettings();
  return {
  title: "Columbus GA to Atlanta Airport Shuttle Service | Volt Transportation",
  description:
    `Book your Columbus GA to Atlanta Airport shuttle today. Premium Ford Transit Passenger Van service — only 8 passengers, professional drivers, ${dollars(pricing.adult)}/adult. Reliable. Comfortable.`,
  openGraph: {
    title: "Columbus GA to Atlanta Airport Shuttle | Volt Transportation",
    description:
      "Premium shuttle service between Columbus, GA and ATL Airport. Book online in minutes.",
    url: "https://volt-transportation.com",
  },
  alternates: {
    canonical: "https://volt-transportation.com",
  },
  };
}

// Search-engine data — business details, prices and FAQ from Settings.
const jsonLdFor = (s: AppSettings) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://volt-transportation.com/#business",
      name: "Volt Transportation",
      description:
        "Premium airport shuttle service between Columbus, GA and Atlanta Hartsfield-Jackson Airport.",
      url: "https://volt-transportation.com",
      telephone: s.business.phoneHref.replace("tel:", ""),
      email: s.business.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: s.business.street,
        ...cityLineParts(s.business.cityLine),
        addressCountry: "US",
      },
      geo: { "@type": "GeoCoordinates", latitude: 32.5253523, longitude: -84.9291663 },
      hasMap: GOOGLE_MAPS_URL,
      sameAs: [GOOGLE_MAPS_URL],
      priceRange: "$$",
      currenciesAccepted: "USD",
    },
    {
      "@type": "TransportationService",
      name: "Columbus GA to Atlanta Airport Shuttle",
      provider: { "@id": "https://volt-transportation.com/#business" },
      areaServed: [
        {
          "@type": "City",
          name: "Columbus",
          containedInPlace: { "@type": "State", name: "Georgia" },
        },
        {
          "@type": "Airport",
          name: "Hartsfield-Jackson Atlanta International Airport",
          iataCode: "ATL",
          address: {
            "@type": "PostalAddress",
            streetAddress: "6000 North Terminal Parkway, Suite 4000",
            addressLocality: "Atlanta",
            addressRegion: "GA",
            postalCode: "30320",
            addressCountry: "US",
          },
        },
      ],
      offers: {
        "@type": "Offer",
        price: String(s.pricing.adult),
        priceCurrency: "USD",
        description: "Adult one-way shuttle ticket",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqItems(s).map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  ],
});

// "Columbus, GA 31909" → locality / region / postal code.
function cityLineParts(line: string) {
  const m = line.match(/^\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})/);
  return m ? { addressLocality: m[1], addressRegion: m[2].toUpperCase(), postalCode: m[3] } : { addressLocality: line };
}

export default async function HomePage() {
  const settings = await getAppSettings();
  const jsonLd = jsonLdFor(settings);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MobileBookCTA />
      <Navbar />
      <main>
        <HeroSection />
        <WhyVolt address={`${settings.business.street}, ${settings.business.cityLine}`} />
        <PricingSection />
        <ReviewsSection />
        <LobbyGallery />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
