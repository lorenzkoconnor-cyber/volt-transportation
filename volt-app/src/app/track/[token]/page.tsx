import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { loadTrack } from "@/lib/track-server";
import TrackView from "./TrackView";

// Rider tracking page — texted when the driver heads out. The link carries
// the reservation's unguessable track token, so it isn't indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your Volt van",
  robots: { index: false, follow: false },
};

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadTrack(token);
  if (!page) notFound();
  return (
    <>
      <Navbar />
      <main className="pt-20 pb-16 px-4">
        <div className="max-w-lg mx-auto">
          <TrackView token={token} initial={page} />
        </div>
      </main>
    </>
  );
}
