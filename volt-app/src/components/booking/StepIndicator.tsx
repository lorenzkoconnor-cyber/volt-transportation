import { Check } from "lucide-react";

const STEPS = [
  { number: 1, label: "Trip Details" },
  { number: 2, label: "Departure" },
  { number: 3, label: "Passengers" },
  { number: 4, label: "Payment" },
  { number: 5, label: "Confirmed" },
];

interface Props {
  currentStep: number;
  // When set, completed steps become buttons. Upcoming steps never are.
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-6 sm:mb-10">
      <div className="flex items-center justify-between relative">
        {/* Background line */}
        <div className="absolute top-4 left-0 right-0 h-px bg-white/10" />
        {/* Progress line */}
        <div
          className="absolute top-4 left-0 h-px bg-[#FCC300] transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step) => {
          const done   = currentStep > step.number;
          const active = currentStep === step.number;
          const clickable = done && !!onStepClick;

          const circle = (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              done
                ? "bg-[#FCC300] text-[#0A0A0A]"
                : active
                ? "bg-[#FCC300] text-[#0A0A0A] ring-4 ring-[#FCC300]/25"
                : "bg-[#171717] border border-white/15 text-[#A1A1AA]"
            } ${clickable ? "group-hover:ring-4 group-hover:ring-[#FCC300]/25 group-focus-visible:ring-4 group-focus-visible:ring-[#FCC300]/50" : ""}`}>
              {done ? <Check className="w-4 h-4" /> : step.number}
            </div>
          );
          // On mobile show only active label, on sm+ show all
          const label = (
            <span className={`text-xs font-medium whitespace-nowrap transition-colors
              ${active ? "block text-white" : done ? `hidden sm:block text-[#FCC300] ${clickable ? "group-hover:underline underline-offset-4" : ""}` : "hidden sm:block text-[#A1A1AA]"}`}>
              {step.label}
            </span>
          );
          const className = "relative flex flex-col items-center gap-1.5 sm:gap-2 z-10";

          return clickable ? (
            <button
              key={step.number}
              type="button"
              onClick={() => onStepClick(step.number)}
              aria-label={`Go back to ${step.label}`}
              title={`Edit ${step.label}`}
              className={`group ${className} cursor-pointer focus-visible:outline-none`}
            >
              {circle}
              {label}
            </button>
          ) : (
            <div key={step.number} aria-current={active ? "step" : undefined} className={className}>
              {circle}
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
