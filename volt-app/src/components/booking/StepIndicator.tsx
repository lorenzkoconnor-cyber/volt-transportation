import { Check } from "lucide-react";

const STEPS = [
  { number: 1, label: "Trip Details" },
  { number: 2, label: "Choose Departure" },
  { number: 3, label: "Passenger Info" },
  { number: 4, label: "Payment" },
  { number: 5, label: "Confirmation" },
];

export default function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-10">
      <div className="flex items-center justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-4 left-0 right-0 h-px bg-white/10" />
        <div
          className="absolute top-4 left-0 h-px bg-[#7C3AED] transition-all duration-500"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step) => {
          const done = currentStep > step.number;
          const active = currentStep === step.number;
          return (
            <div key={step.number} className="relative flex flex-col items-center gap-2 z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  done
                    ? "bg-[#7C3AED] text-white"
                    : active
                    ? "bg-[#7C3AED] text-white ring-4 ring-[#7C3AED]/25"
                    : "bg-[#171717] border border-white/15 text-[#A1A1AA]"
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : step.number}
              </div>
              <span
                className={`hidden sm:block text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? "text-white" : done ? "text-[#7C3AED]" : "text-[#A1A1AA]"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
