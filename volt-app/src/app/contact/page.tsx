"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Mail, Clock, CheckCircle } from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    // TODO: wire up to email API / Supabase function
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">Contact Us</h1>
            <p className="text-[#A1A1AA] text-lg">
              Have a question? We're here to help. Reach out and we'll get back to you quickly.
            </p>
          </div>
        </section>

        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact info */}
            <div className="space-y-5">
              <div className="glass rounded-2xl overflow-hidden relative aspect-[4/3]">
                <Image
                  src="/images/volt-business-interior-building.png"
                  alt="Inside the Volt Transportation office in Columbus, Georgia"
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/80 via-transparent to-transparent pointer-events-none" />
                <span className="absolute bottom-4 left-5 text-white text-sm font-semibold">Our Columbus Office</span>
              </div>

              <div className="glass rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center mb-4">
                  <Phone className="w-5 h-5 text-[#7C3AED]" />
                </div>
                <h3 className="text-white font-semibold mb-1">Phone</h3>
                <a href="tel:+11234567890" className="text-[#A1A1AA] hover:text-white text-sm transition-colors">
                  (123) 456-7890
                </a>
              </div>

              <div className="glass rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center mb-4">
                  <Mail className="w-5 h-5 text-[#7C3AED]" />
                </div>
                <h3 className="text-white font-semibold mb-1">Email</h3>
                <a href="mailto:hello@volttransportation.com" className="text-[#A1A1AA] hover:text-white text-sm transition-colors break-all">
                  hello@volttransportation.com
                </a>
              </div>

              <div className="glass rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center mb-4">
                  <Clock className="w-5 h-5 text-[#7C3AED]" />
                </div>
                <h3 className="text-white font-semibold mb-1">Hours</h3>
                <p className="text-[#A1A1AA] text-sm">Daily · 5:00 AM – 10:00 PM</p>
              </div>

              <div className="glass rounded-xl p-5 border border-[#7C3AED]/20">
                <p className="text-[#7C3AED] text-sm font-medium mb-1">Already booked?</p>
                <p className="text-[#A1A1AA] text-sm mb-3">Manage or modify your existing reservation.</p>
                <Link href="/manage-reservation">
                  <Button variant="outline" size="sm" className="w-full border-[#7C3AED]/40 text-[#7C3AED] hover:bg-[#7C3AED]/10">
                    Manage Reservation
                  </Button>
                </Link>
              </div>
            </div>

            {/* Contact form */}
            <div className="lg:col-span-2">
              <div className="glass rounded-2xl p-8">
                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#7C3AED]/15 flex items-center justify-center mb-4">
                      <CheckCircle className="w-8 h-8 text-[#7C3AED]" />
                    </div>
                    <h3 className="text-white font-bold text-xl mb-2">Message sent!</h3>
                    <p className="text-[#A1A1AA]">We'll get back to you within a few hours.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <Label htmlFor="name" className="text-[#A1A1AA] text-sm mb-2 block">Full Name</Label>
                        <Input
                          id="name"
                          required
                          placeholder="John Smith"
                          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED]"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone" className="text-[#A1A1AA] text-sm mb-2 block">Phone Number</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="(706) 555-0000"
                          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED]"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-[#A1A1AA] text-sm mb-2 block">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        placeholder="you@email.com"
                        className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="subject" className="text-[#A1A1AA] text-sm mb-2 block">Subject</Label>
                      <Input
                        id="subject"
                        required
                        placeholder="How can we help?"
                        className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-12 rounded-xl focus:border-[#7C3AED]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="message" className="text-[#A1A1AA] text-sm mb-2 block">Message</Label>
                      <Textarea
                        id="message"
                        required
                        placeholder="Tell us what you need..."
                        rows={5}
                        className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 rounded-xl focus:border-[#7C3AED] resize-none"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl disabled:opacity-60"
                    >
                      {loading ? "Sending..." : "Send Message"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
