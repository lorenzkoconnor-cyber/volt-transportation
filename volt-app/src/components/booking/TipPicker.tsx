"use client";

// Tip buttons — No tip · $5 · $10 · $20 · Custom. Used at online checkout, on
// the ride-along page, on the after-trip tip page and in the Team Portal.

import { useState } from "react";
import { Heart } from "lucide-react";
import { MAX_TIP_CENTS, TIP_PRESETS_CENTS, tipFromDollars } from "@/lib/tips";

interface Props {
  valueCents: number;
  onChange: (cents: number) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  // Hide "No tip" (the after-trip page, where tipping is the point).
  required?: boolean;
  // No card wrapper (the Team Portal puts it inside its own card).
  bare?: boolean;
}

const usd = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

export default function TipPicker({
  valueCents, onChange, disabled = false, required = false, bare = false,
  title = "Add a tip for your driver",
  description = "Optional — a thank-you for great service.",
}: Props) {
  const [custom, setCustom] = useState(valueCents > 0 && !TIP_PRESETS_CENTS.includes(valueCents));
  const [customText, setCustomText] = useState(custom ? (valueCents / 100).toFixed(2) : "");

  const pick = (cents: number) => { setCustom(false); setCustomText(""); onChange(cents); };
  const options: [string, number | "custom"][] = [
    ...(required ? [] : [["No tip", 0] as [string, number]]),
    ...TIP_PRESETS_CENTS.map((c) => [usd(c), c] as [string, number]),
    ["Custom", "custom"],
  ];
  const active = (v: number | "custom") => (v === "custom" ? custom : !custom && valueCents === v);

  const body = (
    <>
      <div className="flex items-center gap-2">
        <Heart className="w-4 h-4 text-[#FCC300]" />
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      {description && <p className="text-[#A1A1AA] text-xs">{description}</p>}
      <div className={`grid gap-2 ${options.length === 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
        {options.map(([label, v]) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => (v === "custom" ? (setCustom(true), onChange(tipFromDollars(customText))) : pick(v))}
            className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all border disabled:opacity-60 ${
              active(v)
                ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#FCC300]/50 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {custom && (
        <div className="flex items-center gap-2 max-w-[200px]">
          <span className="text-white text-sm">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_TIP_CENTS / 100}
            step="0.01"
            value={customText}
            disabled={disabled}
            autoFocus
            placeholder="0.00"
            aria-label="Custom tip amount in dollars"
            onChange={(e) => { setCustomText(e.target.value); onChange(tipFromDollars(e.target.value)); }}
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300]"
          />
        </div>
      )}
    </>
  );

  return bare ? <div className="space-y-3">{body}</div> : <div className="glass rounded-2xl p-5 space-y-3">{body}</div>;
}
