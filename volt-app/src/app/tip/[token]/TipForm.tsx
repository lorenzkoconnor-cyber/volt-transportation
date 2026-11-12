"use client";

import { useState } from "react";
import { CheckCircle2, Heart, Star } from "lucide-react";
import TipPicker from "@/components/booking/TipPicker";
import QuickCardPay from "@/components/booking/QuickCardPay";
import { formatCents } from "@/lib/format";
import { MIN_SEPARATE_TIP_CENTS, TIP_PRESETS_CENTS } from "@/lib/tips";
import type { TipPage } from "@/lib/tips-server";

async function post(body: unknown) {
  const res = await fetch("/api/tips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export default function TipForm({ token, page }: { token: string; page: TipPage }) {
  const [cents, setCents] = useState(TIP_PRESETS_CENTS[1]);
  const [paid, setPaid] = useState<number | null>(null);

  if (paid !== null) {
    return (
      <div className="glass rounded-2xl p-8 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-[#FCC300] mx-auto" />
        <h1 className="text-2xl font-bold text-white">Thank you{page.firstName ? `, ${page.firstName}` : ""}!</h1>
        <p className="text-[#A1A1AA]">Your {formatCents(paid)} tip has been received. We&apos;ll pass your thanks along.</p>
        <a href={`/review/${token}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold px-5 py-2.5 transition-colors">
          <Star className="w-4 h-4" /> How was your ride? Leave a review
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <Heart className="w-10 h-10 text-[#FCC300] mx-auto" />
        <h1 className="text-3xl font-bold text-white">Tip your driver</h1>
        <p className="text-[#A1A1AA]">
          {page.firstName ? `Thanks for riding with Volt, ${page.firstName}.` : "Thanks for riding with Volt."}
          {page.tripLabel && ` ${page.tripLabel} · ${page.confirmationNumber}`}
        </p>
        {page.alreadyTippedCents > 0 && (
          <p className="text-green-400 text-sm">You&apos;ve already tipped {formatCents(page.alreadyTippedCents)} on this trip — thank you!</p>
        )}
      </div>
      <TipPicker required valueCents={cents} onChange={setCents} title="How much would you like to tip?" description="" />
      <div className="glass rounded-2xl p-5">
        <QuickCardPay
          amountCents={cents}
          label={`Tip ${formatCents(cents)}`}
          walletButton="tip"
          blockedReason={cents < MIN_SEPARATE_TIP_CENTS ? "Tips start at $1." : null}
          prepare={() => post({ action: "start", token, cents })}
          onPaid={async (paymentIntentId) => {
            await post({ action: "record", paymentIntentId, token, cents });
            setPaid(cents);
            window.scrollTo({ top: 0 });
          }}
        />
      </div>
    </div>
  );
}
