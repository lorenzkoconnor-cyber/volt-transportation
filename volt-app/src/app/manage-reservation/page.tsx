"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, ArrowRight, Calendar, MapPin, Users, Clock } from "lucide-react";

type Reservation = {
  confirmationNumber: string;
  status: string;
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  total: number;
};

export default function ManageReservationPage() {
  const [confirmNumber, setConfirmNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setReservation(null);

    // TODO: wire up to Supabase API
    await new Promise((r) => setTimeout(r, 800));

    // Mock: show demo reservation for any input
    if (confirmNumber && phone) {
      setReservation({
        confirmationNumber: confirmNumber.toUpperCase(),
        status: "Confirmed",
        from: "Columbus, GA",
        to: "ATL Airport",
        date: "June 15, 2025",
        time: "8:00 AM",
        passengers: 2,
        total: 118,
      });
    } else {
      setError("No reservation found. Please check your confirmation number and phone number.");
    }
    setLoading(false);
  };

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
                Manage Reservation
              </h1>
              <p className="text-[#A1A1AA]">
                No account required. Enter your confirmation number and phone number to access your booking.
              </p>
            </div>

            {!reservation ? (
              <div className="glass rounded-2xl p-8">
                <form onSubmit={handleLookup} className="space-y-5">
                  <div>
                    <Label htmlFor="confirmation" className="text-[#A1A1AA] text-sm mb-2 block">
                      Confirmation Number
                    </Label>
                    <Input
                      id="confirmation"
                      required
                      value={confirmNumber}
                      onChange={(e) => setConfirmNumber(e.target.value)}
                      placeholder="e.g. VOLT-123456"
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED] uppercase"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-[#A1A1AA] text-sm mb-2 block">
                      Phone Number Used at Booking
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(706) 555-0000"
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED]"
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl disabled:opacity-60 group"
                  >
                    {loading ? (
                      "Looking up..."
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Find My Reservation
                      </>
                    )}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Reservation card */}
                <div className="glass rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-white/8">
                    <div>
                      <p className="text-[#A1A1AA] text-xs uppercase tracking-wider mb-1">Confirmation</p>
                      <h2 className="text-white font-bold text-xl">{reservation.confirmationNumber}</h2>
                    </div>
                    <span className="px-3 py-1.5 rounded-full bg-green-500/15 text-green-400 text-xs font-semibold">
                      {reservation.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-white/5 divide-x divide-white/5">
                    {[
                      { icon: MapPin, label: "From", value: reservation.from },
                      { icon: MapPin, label: "To", value: reservation.to },
                      { icon: Calendar, label: "Date", value: reservation.date },
                      { icon: Clock, label: "Departure", value: reservation.time },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="p-4 bg-[#0F0F0F]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="w-3 h-3 text-[#7C3AED]" />
                            <span className="text-[#A1A1AA] text-xs">{item.label}</span>
                          </div>
                          <div className="text-white text-sm font-medium">{item.value}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between p-5 border-t border-white/8">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#A1A1AA]" />
                      <span className="text-[#A1A1AA] text-sm">{reservation.passengers} passengers</span>
                    </div>
                    <span className="text-white font-bold text-lg">${reservation.total}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Add Luggage", desc: "Add extra bags" },
                    { label: "Add Pet", desc: "Add a pet to booking" },
                    { label: "Update Info", desc: "Edit passenger details" },
                    { label: "View Receipt", desc: "Download your receipt" },
                  ].map((action) => (
                    <button
                      key={action.label}
                      className="glass rounded-xl p-4 text-left hover:border-[#7C3AED]/30 transition-all group"
                    >
                      <div className="text-white font-medium text-sm group-hover:text-[#7C3AED] transition-colors">
                        {action.label}
                      </div>
                      <div className="text-[#A1A1AA] text-xs mt-0.5">{action.desc}</div>
                    </button>
                  ))}
                </div>

                <button className="w-full glass rounded-xl p-4 text-left hover:border-red-500/30 transition-all group">
                  <div className="text-red-400 font-medium text-sm">Cancel Reservation</div>
                  <div className="text-[#A1A1AA] text-xs mt-0.5">
                    Free cancellation until 11:59 PM the day before your trip
                  </div>
                </button>

                <button
                  onClick={() => setReservation(null)}
                  className="w-full text-[#A1A1AA] hover:text-white text-sm transition-colors py-2"
                >
                  ← Look up a different reservation
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
