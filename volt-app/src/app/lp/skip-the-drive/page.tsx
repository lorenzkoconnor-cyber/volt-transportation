import type { Metadata } from "next";
import AdLanding from "@/components/marketing/AdLanding";
import { getAppSettings } from "@/lib/settings-server";

// Landing page for Facebook/Instagram ad A ("Skip the drive to ATL", van photo).
// Ad-only: kept out of search results so it doesn't compete with the homepage.
export const metadata: Metadata = {
  title: "Skip the Drive to ATL",
  description: "Columbus, GA to Atlanta airport (ATL) shuttle. Free parking, departures every day.",
  robots: { index: false, follow: true },
};

export default async function SkipTheDrivePage() {
  const settings = await getAppSettings();
  return (
    <AdLanding
      settings={settings}
      copy={{
        eyebrow: "Columbus → ATL Airport",
        headline: "Skip the drive to ATL.",
        subhead: "No I-85 traffic, no airport parking bill. Park free in Columbus and ride a Volt van to your terminal.",
        image: { src: "/images/volt-team-vans.jpg", alt: "Volt Transportation's Ford Transit vans in Columbus, GA" },
      }}
    />
  );
}
