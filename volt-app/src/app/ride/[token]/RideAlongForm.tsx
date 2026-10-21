"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Minus, Plus, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TipPicker from "@/components/booking/TipPicker";
import QuickCardPay from "@/components/booking/QuickCardPay";
import { formatCents, formatTime12h, formatDateShort } from "@/lib/format";
import { dollars } from "@/lib/settings";
import type { RideAlongPage } from "@/lib/ride-along";

const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-12 rounded-xl focus:border-[#FCC300]";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Counter({ label, hint, value, min, max, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-white text-sm font-medium">{label}</div>
        <div className="text-[#A1A1AA] text-xs">{hint}</div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-white disabled:opacity-30">
          <Minus className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold w-5 text-center">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-white disabled:opacity-30">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function RideAlongForm({ token, page }: { token: string; page: RideAlongPage }) {
  const { trip, pricing: P } = page;
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [pets, setPets] = useState(0);
  const [extraBags, setExtraBags] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [tipCents, setTipCents] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const checkoutRef = useRef("");

  const seats = adults + children;
  const fareCents = Math.round((adults * P.adult + children * P.child + pets * P.pet + extraBags * P.extraBag) * 100);
  const totalCents = fareCents + tipCents;

  const blocked =
    !name.trim() ? "Enter your name." :
    phone.replace(/\D/g, "").length < 10 ? "Enter a 10-digit phone number." :
    email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "That email address doesn't look right." :
    seats > trip.seatsLeft ? `Only ${trip.seatsLeft} seat${trip.seatsLeft === 1 ? "" : "s"} left on this van.` :
    !termsAgreed ? "Please agree to the Terms & Conditions." : null;

  const prepare = async () => {
    const res = await fetch("/api/ride-along/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token, adults, children, pets, extraBags, tipCents, smsConsent, termsAgreed,
        primaryPassenger: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Payment couldn't be started. Please try again.");
    checkoutRef.current = data.checkoutId;
    return data;
  };

  // Same confirmation step as an online booking (the webhook does it too).
  const onPaid = async (paymentIntentId: string) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId: checkoutRef.current, paymentIntentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDone(data.confirmationNumber); window.scrollTo({ top: 0 }); return; }
      if (res.status === 202 && data.processing) { await sleep(1500); continue; }
      if (res.status === 409 || res.status === 400) throw new Error(data.error);
      break;
    }
    setNote("Your payment went through — show this screen to your driver. Your confirmation is on its way by text or email.");
    setDone("");
    window.scrollTo({ top: 0 });
  };

  if (done !== null) {
    return (
      <div className="glass rounded-2xl p-8 text-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
        <h1 className="text-2xl font-bold text-white">You&apos;re on board!</h1>
        {done && <div className="text-[#FCC300] font-mono text-3xl font-bold tracking-wider">{done}</div>}
        <p className="text-[#A1A1AA]">
          {note || "Show this screen to your driver."} {trip.from} → {trip.to} · {seats} rider{seats === 1 ? "" : "s"}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">Ride with Volt</h1>
        <p className="text-[#A1A1AA] mt-1">
          {trip.from} → {trip.to} · {formatDateShort(trip.date)}, {formatTime12h(trip.time)}
        </p>
        <p className="text-[#A1A1AA] text-xs mt-1 flex items-center justify-center gap-1">
          <Users className="w-3.5 h-3.5" />{trip.seatsLeft} seat{trip.seatsLeft === 1 ? "" : "s"} left
        </p>
      </div>

      <div className="glass rounded-2xl p-5 divide-y divide-white/5">
        <Counter label="Adults" hint={`${dollars(P.adult)} each`} value={adults} min={1} max={Math.max(1, Math.min(10, trip.seatsLeft - children))} onChange={setAdults} />
        <Counter label="Children" hint={`Ages 2–12 · ${dollars(P.child)} each`} value={children} min={0} max={Math.max(0, Math.min(10, trip.seatsLeft - adults))} onChange={setChildren} />
        <Counter label="Extra bags" hint={`One bag per rider is free · ${dollars(P.extraBag)} each extra`} value={extraBags} min={0} max={10} onChange={setExtraBags} />
        <Counter label="Pets" hint={`${dollars(P.pet)} each`} value={pets} min={0} max={4} onChange={setPets} />
      </div>

      <div className="glass rounded-2xl p-5 space-y-3">
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Your name *</Label>
          <Input value={name} autoComplete="name" placeholder="First and last name" className={inputCls} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone *</Label>
          <Input value={phone} type="tel" autoComplete="tel" placeholder="(706) 555-0000" className={inputCls} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Email for your receipt (optional)</Label>
          <Input value={email} type="email" autoComplete="email" placeholder="you@email.com" className={inputCls} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className="mt-0.5 accent-[#FCC300] w-4 h-4 flex-shrink-0" />
          <span>
            <span className="text-white text-sm font-medium block">Text me about this ride (optional)</span>
            <span className="text-[#A1A1AA] text-xs leading-relaxed block mt-1">
              By checking this box, I agree to receive text messages from Volt Transportation at the phone number
              above about my reservation, including booking confirmations, trip reminders, and pickup or schedule
              updates. Consent is not a condition of purchase. Message frequency varies. Message and data rates may
              apply. Reply STOP to opt out at any time or HELP for help. See our{" "}
              <a href="/privacy-policy" target="_blank" className="text-[#FCC300] hover:underline">Privacy Policy</a>
              {" "}and{" "}
              <a href="/terms#sms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>.
            </span>
          </span>
        </label>
      </div>

      <TipPicker valueCents={tipCents} onChange={setTipCents} />

      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-[#A1A1AA]">Fare</span><span className="text-white">{formatCents(fareCents)}</span></div>
          {tipCents > 0 && <div className="flex justify-between"><span className="text-[#A1A1AA]">Tip</span><span className="text-white">{formatCents(tipCents)}</span></div>}
          <div className="flex justify-between font-bold border-t border-white/10 pt-2">
            <span className="text-white">Total</span><span className="text-[#FCC300] text-lg">{formatCents(totalCents)}</span>
          </div>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#FCC300] flex-shrink-0" />
          <span className="text-[#A1A1AA] text-xs leading-relaxed">
            I have read and agree to Volt Transportation&apos;s{" "}
            <a href="/terms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>
            {" "}and{" "}
            <a href="/safety-rules" target="_blank" className="text-[#FCC300] hover:underline">Safety &amp; Rules</a>, and
            acknowledge the{" "}
            <a href="/privacy-policy" target="_blank" className="text-[#FCC300] hover:underline">Privacy Policy</a>.
          </span>
        </label>
        <QuickCardPay amountCents={totalCents} label={`Pay ${formatCents(totalCents)}`} blockedReason={blocked} prepare={prepare} onPaid={onPaid} />
      </div>
    </div>
  );
}
