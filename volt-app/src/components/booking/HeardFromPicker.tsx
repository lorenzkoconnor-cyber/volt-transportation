"use client";

// "How did you hear about us?" — optional, one tap. Tapping the chosen answer
// again clears it. "Other" opens an optional text box. See src/lib/heard-from.ts.

import { Megaphone } from "lucide-react";
import { HEARD_FROM_OPTIONS, HEARD_FROM_OTHER_MAX, type HeardFrom } from "@/lib/heard-from";

interface Props {
  value: HeardFrom | null;
  onChange: (value: HeardFrom | null) => void;
  otherText: string;
  onOtherTextChange: (text: string) => void;
  disabled?: boolean;
}

export default function HeardFromPicker({ value, onChange, otherText, onOtherTextChange, disabled = false }: Props) {
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-[#FCC300]" />
        <h3 className="text-white font-semibold">How did you hear about us?</h3>
      </div>
      <p className="text-[#A1A1AA] text-xs">Optional — it helps a small local business.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How did you hear about us?">
        {HEARD_FROM_OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(active ? null : o.value)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all border disabled:opacity-60 ${
                active
                  ? "bg-[#FCC300] text-[#0A0A0A] border-[#FCC300]"
                  : "bg-white/5 text-[#A1A1AA] border-white/10 hover:border-[#FCC300]/50 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value === "other" && (
        <input
          type="text"
          value={otherText}
          disabled={disabled}
          autoFocus
          maxLength={HEARD_FROM_OTHER_MAX}
          placeholder="Tell us where (optional)"
          aria-label="Where did you hear about us? (optional)"
          onChange={(e) => onOtherTextChange(e.target.value)}
          className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm placeholder:text-[#71717A] focus:outline-none focus:border-[#FCC300]"
        />
      )}
    </div>
  );
}
