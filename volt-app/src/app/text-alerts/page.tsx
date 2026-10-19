"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSettings } from "@/context/SettingsContext";
import { CheckCircle2, MessageSquare } from "lucide-react";

// Public SMS opt-in page — the "call to action" URL for 10DLC registration.
// The phone field, consent checkbox and full disclosure are visible on load
// (checkout's opt-in box is several steps deep, out of a reviewer's reach).
export default function TextAlertsPage() {
  const { business } = useAppSettings();
  const [confirmNumber, setConfirmNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Check the box to agree to receive text messages.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/booking/text-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationNumber: confirmNumber, phone, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const inputCls =
    "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#FCC300]";

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#FCC300]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
                Booking Text Alerts
              </h1>
              <p className="text-[#A1A1AA]">
                Get texts from Volt Transportation about your shuttle reservation: booking confirmations, trip
                reminders, and pickup or schedule updates.
              </p>
            </div>

            {done ? (
              <div className="glass rounded-2xl p-8 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-[#FCC300] mx-auto" />
                <h2 className="text-white text-xl font-semibold">You&apos;re signed up</h2>
                <p className="text-[#A1A1AA] text-sm">
                  We&apos;ll text you about reservation {confirmNumber.trim().toUpperCase()}. Reply STOP to any
                  message to opt out, or HELP for help.
                </p>
              </div>
            ) : (
              <div className="glass rounded-2xl p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <Label htmlFor="phone" className="text-[#A1A1AA] text-sm mb-2 block">
                      Mobile Phone Number
                    </Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(706) 555-0000"
                      className={inputCls}
                    />
                    <p className="text-[#A1A1AA] text-xs mt-1.5">Use the phone number on your booking.</p>
                  </div>
                  <div>
                    <Label htmlFor="confirmation" className="text-[#A1A1AA] text-sm mb-2 block">
                      Confirmation Number
                    </Label>
                    <Input
                      id="confirmation"
                      required
                      value={confirmNumber}
                      onChange={(e) => setConfirmNumber(e.target.value)}
                      placeholder="e.g. VOLT-AB12CD"
                      className={`${inputCls} uppercase`}
                    />
                  </div>

                  <label htmlFor="sms-consent" className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/10 p-4 cursor-pointer">
                    <input
                      id="sms-consent"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 accent-[#FCC300] w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-[#A1A1AA] text-xs leading-relaxed">
                      By checking this box, I agree to receive text messages from Volt Transportation at the phone
                      number above about my reservation, including booking confirmations, trip reminders, and pickup or
                      schedule updates. Consent is not a condition of purchase. Message frequency varies. Message and
                      data rates may apply. Reply STOP to opt out at any time or HELP for help. See our{" "}
                      <a href="/privacy-policy" target="_blank" className="text-[#FCC300] hover:underline">Privacy Policy</a>
                      {" "}and{" "}
                      <a href="/terms#sms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>.
                    </span>
                  </label>

                  {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-12 rounded-xl disabled:opacity-60"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {loading ? "Signing up..." : "Sign Up for Text Alerts"}
                  </Button>
                </form>
              </div>
            )}

            <div className="mt-8 glass rounded-2xl p-6 space-y-3 text-sm text-[#A1A1AA]">
              <h2 className="text-white font-semibold">About Volt booking texts</h2>
              <p>
                You can also opt in when you book: check &ldquo;Text me about this booking&rdquo; on the Passenger
                Information step at checkout, or tell our staff yes when booking by phone or in person. Texting is
                optional — you&apos;ll always get your confirmation by email.
              </p>
              <p>
                We only send messages about reservations you made. We never send marketing texts, and we never sell or
                share your mobile number or consent with third parties for marketing.
              </p>
              <p>
                Example: &ldquo;Volt Transportation: Hi Sam! Your ride is confirmed. Confirmation: VOLT-AB12CD … Arrive
                20 min early. Reply STOP to opt out.&rdquo;
              </p>
              <p>
                Help: reply HELP, email {business.email}, or call {business.phone}. Carriers are not liable for delayed
                or undelivered messages.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
