import type { Metadata } from "next";
import AdLanding from "@/components/marketing/AdLanding";
import { getAppSettings } from "@/lib/settings-server";

// Landing page for Facebook/Instagram ad B ("Flying out of ATL? Let us drive.", storefront photo).
// Ad-only: kept out of search results so it doesn't compete with the homepage.
export const metadata: Metadata = {
  title: "Flying Out of ATL? Let Us Drive.",
  description: "Columbus, GA to Atlanta airport (ATL) shuttle. Free parking, departures every day.",
  robots: { index: false, follow: true },
};

export default async function LetUsDrivePage() {
  const settings = await getAppSettings();
  return (
    <AdLanding
      settings={settings}
      copy={{
        eyebrow: "Columbus → ATL Airport",
        headline: "Flying out of ATL? Let us drive.",
        subhead: "Start your trip at our Columbus lobby, not on I-85. Park free, then ride to your terminal while someone else drives.",
        image: { src: "/images/volt-storefront-wide.jpg", alt: "Volt Transportation's storefront and lobby in Columbus, GA" },
      }}
    />
  );
}
