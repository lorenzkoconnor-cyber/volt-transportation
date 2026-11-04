"use client";

// A two-option switch that starts with its knob in the middle (nothing
// chosen) so the rider has to pick a side. `value` is null until they do:
// false = left option, true = right option.
interface Props {
  value: boolean | null;
  onChange: (value: boolean) => void;
  offLabel: string;   // left option (value false)
  onLabel: string;    // right option (value true)
  groupLabel: string; // read to screen readers
  invalid?: boolean;  // highlight when the rider tried to continue without choosing
}

export default function ChoiceSwitch({ value, onChange, offLabel, onLabel, groupLabel, invalid = false }: Props) {
  const knob =
    value === null ? "left-1/2 -translate-x-1/2" : value ? "left-[calc(100%-1.375rem)]" : "left-0.5";
  const track =
    value === null
      ? invalid ? "bg-red-500/20 ring-1 ring-red-400" : "bg-white/10 ring-1 ring-white/15"
      : "bg-[#FCC300]";
  const labelCls = (active: boolean) =>
    `text-sm select-none transition-colors ${active ? "text-white font-semibold" : "text-[#A1A1AA] hover:text-white"}`;

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      aria-required="true"
      aria-invalid={invalid && value === null}
      className="flex items-center gap-2.5"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); onChange(false); }
        if (e.key === "ArrowRight") { e.preventDefault(); onChange(true); }
      }}
    >
      <button type="button" role="radio" aria-checked={value === false} onClick={() => onChange(false)}
        className={labelCls(value === false)}>
        {offLabel}
      </button>

      {/* Track: tapping the left half picks the left option, right half the right */}
      <div className={`relative w-14 h-6 rounded-full flex-shrink-0 transition-colors ${track}`}>
        <span aria-hidden className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all duration-200 ${value === null ? "bg-[#A1A1AA]" : "bg-white"} ${knob}`} />
        <button type="button" tabIndex={-1} aria-hidden onClick={() => onChange(false)} className="absolute inset-y-0 left-0 w-1/2 rounded-l-full" />
        <button type="button" tabIndex={-1} aria-hidden onClick={() => onChange(true)} className="absolute inset-y-0 right-0 w-1/2 rounded-r-full" />
      </div>

      <button type="button" role="radio" aria-checked={value === true} onClick={() => onChange(true)}
        className={labelCls(value === true)}>
        {onLabel}
      </button>
    </div>
  );
}
