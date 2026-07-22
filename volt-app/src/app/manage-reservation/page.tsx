"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTime12h, formatDateLong, formatCents } from "@/lib/format";
import { Search, Calendar, MapPin, Users, Clock, CheckCircle2 } from "lucide-react";

type Reservation = {
  confirmationNumber: string;
  status: string;
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  totalCents: number;
};

export default function ManageReservationPage() {
  const [confirmNumber, setConfirmNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");

  const callManage = async (action: "lookup" | "cancel") => {
    const res = await fetch("/api/booking/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, confirmationNumber: confirmNumber, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data;
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setReservation(null);
    setCancelMessage("");
    setConfirmingCancel(false);

    try {
      const data = await callManage("lookup");
      setReservation(data.reservation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await callManage("cancel");
      setReservation(data.reservation);
      setCancelMessage(data.message ?? "Your reservation is cancelled.");
      setConfirmingCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed.");
      setConfirmingCancel(false);
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
                    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${
                      reservation.status === "cancelled"
                        ? "bg-red-500/15 text-red-400"
                        : reservation.status === "completed"
                        ? "bg-[#7C3AED]/15 text-[#7C3AED]"
                        : "bg-green-500/15 text-green-400"
                    }`}>
                      {reservation.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-white/5 divide-x divide-white/5">
                    {[
                      { icon: MapPin, label: "From", value: reservation.from },
                      { icon: MapPin, label: "To", value: reservation.to },
                      { icon: Calendar, label: "Date", value: formatDateLong(reservation.date) },
                      { icon: Clock, label: "Departure", value: formatTime12h(reservation.time) },
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
                      <span className="text-[#A1A1AA] text-sm">{reservation.passengers} passenger{reservation.passengers !== 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-white font-bold text-lg">{formatCents(reservation.totalCents)}</span>
                  </div>
                </div>

                {cancelMessage && (
                  <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-green-400 text-sm">{cancelMessage}</p>
                  </div>
                )}

                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
                )}

                {/* Changes note */}
                {reservation.status !== "cancelled" && (
                  <div className="glass rounded-xl p-4">
                    <div className="text-white font-medium text-sm">Need to change your trip?</div>
                    <div className="text-[#A1A1AA] text-xs mt-0.5">
                      To change the date, time, luggage, or passengers, call us at the number in the footer —
                      we&apos;ll take care of it in seconds.
                    </div>
                  </div>
                )}

                {/* Cancel */}
                {reservation.status !== "cancelled" && reservation.status !== "completed" && (
                  confirmingCancel ? (
                    <div className="glass rounded-xl p-4 border-red-500/30">
                      <div className="text-white font-medium text-sm mb-3">
                        Cancel {reservation.confirmationNumber}? This can&apos;t be undone.
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={handleCancel} disabled={loading}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold h-10 rounded-xl">
                          {loading ? "Cancelling…" : "Yes, Cancel My Reservation"}
                        </Button>
                        <Button variant="outline" onClick={() => setConfirmingCancel(false)}
                          className="flex-1 border-white/15 text-white hover:bg-white/5 text-sm h-10 rounded-xl">
                          Keep My Trip
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingCancel(true)}
                      className="w-full glass rounded-xl p-4 text-left hover:border-red-500/30 transition-all"
                    >
                      <div className="text-red-400 font-medium text-sm">Cancel Reservation</div>
                      <div className="text-[#A1A1AA] text-xs mt-0.5">
                        Free cancellation until 11:59 PM the day before your trip
                      </div>
                    </button>
                  )
                )}

                <button
                  onClick={() => { setReservation(null); setError(""); setCancelMessage(""); }}
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
