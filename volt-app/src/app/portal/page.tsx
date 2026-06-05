"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  User,
  RotateCcw,
  LogOut,
  Loader2,
} from "lucide-react";

// Mock upcoming trips — will be replaced with Supabase query
const MOCK_TRIPS = [
  {
    id: "1",
    confirmationNumber: "VOLT-AB1234",
    from: "Columbus, GA",
    to: "ATL Airport",
    date: "Friday, July 18, 2026",
    time: "8:00 AM",
    passengers: 2,
    status: "confirmed",
    total: 118,
  },
];

const MOCK_HISTORY = [
  {
    id: "2",
    confirmationNumber: "VOLT-XY9876",
    from: "ATL Airport",
    to: "Columbus, GA",
    date: "Monday, June 2, 2026",
    time: "2:00 PM",
    passengers: 1,
    status: "completed",
    total: 59,
  },
];

export default function PortalPage() {
  const router = useRouter();
  const { user, customer, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirect=/portal");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="flex items-start justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">
                Welcome back{customer ? `, ${customer.firstName}` : ""}
              </h1>
              <p className="text-[#A1A1AA]">{user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/book">
                <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
                  Book a Ride
                </Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="text-[#A1A1AA] hover:text-white hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Upcoming Trips */}
          <section className="mb-10">
            <h2 className="text-white font-bold text-xl mb-4">Upcoming Trips</h2>
            {MOCK_TRIPS.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center">
                <Calendar className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
                <p className="text-white font-medium mb-1">No upcoming trips</p>
                <p className="text-[#A1A1AA] text-sm mb-5">
                  Ready for your next trip to Atlanta Airport?
                </p>
                <Link href="/book">
                  <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
                    Book Now
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {MOCK_TRIPS.map((trip) => (
                  <TripCard key={trip.id} trip={trip} upcoming />
                ))}
              </div>
            )}
          </section>

          {/* Trip History */}
          <section className="mb-10">
            <h2 className="text-white font-bold text-xl mb-4">Trip History</h2>
            {MOCK_HISTORY.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center">
                <p className="text-[#A1A1AA] text-sm">No past trips yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {MOCK_HISTORY.map((trip) => (
                  <TripCard key={trip.id} trip={trip} upcoming={false} />
                ))}
              </div>
            )}
          </section>

          {/* Profile */}
          <section>
            <h2 className="text-white font-bold text-xl mb-4">Profile</h2>
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-[#7C3AED]" />
                </div>
                <div>
                  <div className="text-white font-semibold">
                    {customer
                      ? `${customer.firstName} ${customer.lastName}`
                      : "Volt Customer"}
                  </div>
                  <div className="text-[#A1A1AA] text-sm">{user.email}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Email", value: user.email || "—" },
                  { label: "Phone", value: customer?.phone || "—" },
                ].map((field) => (
                  <div key={field.label} className="bg-white/3 rounded-xl p-4">
                    <div className="text-[#A1A1AA] text-xs mb-1">{field.label}</div>
                    <div className="text-white text-sm font-medium">{field.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Link href="/portal/profile">
                  <Button variant="outline" size="sm" className="border-white/15 text-white hover:bg-white/5">
                    Edit Profile
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ── Trip card component ────────────────────────────────────────────────────────
function TripCard({
  trip,
  upcoming,
}: {
  trip: {
    id: string;
    confirmationNumber: string;
    from: string;
    to: string;
    date: string;
    time: string;
    passengers: number;
    status: string;
    total: number;
  };
  upcoming: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[#A1A1AA] text-xs">{trip.confirmationNumber}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                trip.status === "confirmed"
                  ? "bg-green-500/15 text-green-400"
                  : trip.status === "completed"
                  ? "bg-[#7C3AED]/15 text-[#7C3AED]"
                  : "bg-[#A1A1AA]/15 text-[#A1A1AA]"
              }`}
            >
              {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-white font-semibold mb-2">
            <MapPin className="w-4 h-4 text-[#7C3AED] flex-shrink-0" />
            <span className="truncate">{trip.from}</span>
            <ArrowRight className="w-3 h-3 text-[#A1A1AA] flex-shrink-0" />
            <span className="truncate">{trip.to}</span>
          </div>
          <div className="flex items-center gap-4 text-[#A1A1AA] text-sm flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {trip.date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {trip.time}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-white font-bold">${trip.total}</div>
          <div className="flex gap-2 mt-2 justify-end">
            {upcoming ? (
              <Link href={`/manage-reservation`}>
                <Button size="sm" variant="outline" className="border-white/15 text-white hover:bg-white/5 text-xs">
                  Manage
                </Button>
              </Link>
            ) : (
              <Link href="/book">
                <Button size="sm" variant="outline" className="border-white/15 text-white hover:bg-white/5 text-xs">
                  <RotateCcw className="w-3 h-3 mr-1" /> Rebook
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
