import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { loadRideAlongPage } from "@/lib/ride-along";
import RideAlongForm from "./RideAlongForm";

// Ride-along — the page behind the QR code a Volt driver or office staff shows
// a rider who wants a seat without a reservation. Phone-first, no navigation.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ride with Volt",
  robots: { index: false, follow: false },
};

export default async function RideAlongPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadRideAlongPage(token);

  return (
    <main className="min-h-screen bg-[#0A0A0A] px-4 py-8">
      <div className="max-w-md mx-auto space-y-6">
        <Link href="/" className="block text-center text-[#FCC300] font-bold text-xl">⚡ Volt Transportation</Link>
        {"error" in page ? (
          <div className="glass rounded-2xl p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-white">{page.error}</p>
          </div>
        ) : (
          <RideAlongForm token={token} page={page} />
        )}
      </div>
    </main>
  );
}
