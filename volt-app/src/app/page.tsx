import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/home/HeroSection";
import WhyVolt from "@/components/home/WhyVolt";
import PricingSection from "@/components/home/PricingSection";
import ReviewsSection from "@/components/home/ReviewsSection";
import FAQSection from "@/components/home/FAQSection";
import CTASection from "@/components/home/CTASection";

export const metadata: Metadata = {
  title: "Columbus GA to Atlanta Airport Shuttle Service | Volt Transportation",
  description:
    "Book your Columbus GA to Atlanta Airport shuttle today. Premium Mercedes Sprinter service — only 8 passengers, professional drivers, $59/adult. Reliable. Comfortable.",
  openGraph: {
    title: "Columbus GA to Atlanta Airport Shuttle | Volt Transportation",
    description:
      "Premium shuttle service between Columbus, GA and ATL Airport. Book online in minutes.",
    url: "https://volttransportation.com",
  },
  alternates: {
    canonical: "https://volttransportation.com",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": "https://volttransportation.com/#business",
      name: "Volt Transportation",
      description:
        "Premium airport shuttle service between Columbus, GA and Atlanta Hartsfield-Jackson Airport.",
      url: "https://volttransportation.com",
      telephone: "+11234567890",
      email: "hello@volttransportation.com",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Columbus",
        addressRegion: "GA",
        addressCountry: "US",
      },
      priceRange: "$$",
      currenciesAccepted: "USD",
    },
    {
      "@type": "TransportationService",
      name: "Columbus GA to Atlanta Airport Shuttle",
      provider: { "@id": "https://volttransportation.com/#business" },
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
        },
      ],
      offers: {
        "@type": "Offer",
        price: "59",
        priceCurrency: "USD",
        description: "Adult one-way shuttle ticket",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How much does transportation from Columbus GA to Atlanta Airport cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Adult seats are $59 each. Children (under 12) are $49. Pets are $25 and extra bags are $10 each.",
          },
        },
        {
          "@type": "Question",
          name: "How long does the trip take?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The trip from Columbus, GA to Atlanta Hartsfield-Jackson Airport takes approximately 2 to 2.5 hours depending on traffic conditions.",
          },
        },
        {
          "@type": "Question",
          name: "What is the cancellation policy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can cancel or make changes to your booking up until 11:59 PM the day before your scheduled trip for a full refund.",
          },
        },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        <HeroSection />
        <WhyVolt />
        <PricingSection />
        <ReviewsSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
