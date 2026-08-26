"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import StepIndicator from "@/components/booking/StepIndicator";
import Step1Search from "@/components/booking/Step1Search";
import Step2Departures from "@/components/booking/Step2Departures";
import Step3Passengers from "@/components/booking/Step3Passengers";
import Step4Checkout from "@/components/booking/Step4Checkout";
import Step5Confirmation from "@/components/booking/Step5Confirmation";
import {
  type BookingSearch,
  type DepartureSlot,
  type Passenger,
} from "@/lib/booking";

function BookingFlow() {
  const params = useSearchParams();

  const [step, setStep] = useState(1);
  const [search, setSearch] = useState<BookingSearch>({
    from: (params.get("from") as "columbus" | "atl") || "columbus",
    to: (params.get("to") as "columbus" | "atl") || "atl",
    date: params.get("date") || "",
    returnDate: params.get("returnDate") || "",
    adults: Number(params.get("adults") || 1),
    children: Number(params.get("children") || 0),
    pets: Number(params.get("pets") || 0),
    extraBags: Number(params.get("extraBags") || 0),
    roundTrip: params.get("roundTrip") === "true",
  });
  const [outbound, setOutbound] = useState<DepartureSlot | null>(null);
  const [returnSlot, setReturnSlot] = useState<DepartureSlot | null>(null);
  const [primary, setPrimary] = useState<Passenger>({ name: "", phone: "", email: "" });
  const [additionalPassengers, setAdditionalPassengers] = useState<string[]>([]);
  const [specialNotes, setSpecialNotes] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");

  return (
    <div className="min-h-screen bg-[#0A0A0A] grid-bg">
      {/* Top bar */}
      <div className="glass-dark border-b border-white/8 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7C3AED] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" fill="white" />
            </div>
            <span className="text-white font-semibold">Volt</span>
          </Link>
          {step < 5 && (
            <span className="text-[#A1A1AA] text-sm">Step {step} of 4</span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {/* Purple ambient glow */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#7C3AED]/5 blur-[120px] pointer-events-none" />

        {step < 5 && (
          <div className="relative">
            <StepIndicator currentStep={step} />
          </div>
        )}

        <div className="relative glass rounded-2xl p-4 sm:p-6 lg:p-8">
          {step === 1 && (
            <Step1Search
              initial={search}
              onNext={(s) => {
                setSearch(s);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <Step2Departures
              search={search}
              onNext={(ob, ret) => {
                setOutbound(ob);
                setReturnSlot(ret);
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && outbound && (
            <Step3Passengers
              search={search}
              outbound={outbound}
              onNext={(p, additional, notes) => {
                setPrimary(p);
                setAdditionalPassengers(additional);
                setSpecialNotes(notes);
                setStep(4);
              }}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && outbound && (
            <Step4Checkout
              search={search}
              outbound={outbound}
              returnSlot={returnSlot}
              primary={primary}
              additionalPassengers={additionalPassengers}
              specialNotes={specialNotes}
              onNext={(conf) => {
                setConfirmationNumber(conf);
                setStep(5);
              }}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && outbound && (
            <Step5Confirmation
              confirmationNumber={confirmationNumber}
              search={search}
              outbound={outbound}
              returnSlot={returnSlot}
              primary={primary}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#7C3AED]/30 border-t-[#7C3AED] animate-spin" />
      </div>
    }>
      <BookingFlow />
    </Suspense>
  );
}
