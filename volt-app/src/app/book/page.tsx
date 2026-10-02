"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import StepIndicator from "@/components/booking/StepIndicator";
import Step1Search from "@/components/booking/Step1Search";
import Step2Departures from "@/components/booking/Step2Departures";
import Step3Passengers from "@/components/booking/Step3Passengers";
import Step4Checkout, { type MilitaryResult } from "@/components/booking/Step4Checkout";
import Step5Confirmation from "@/components/booking/Step5Confirmation";
import Logo from "@/components/ui/Logo";
import {
  type BookingSearch,
  type DepartureSlot,
  type Passenger,
  EMPTY_FLIGHT,
} from "@/lib/booking";
import { localDateString } from "@/lib/format";

// In-progress booking, kept for this browser tab so a refresh doesn't lose it.
// Tied to the URL it started from: arriving with a new search starts fresh.
const STORAGE_KEY = "volt-booking-progress-v1";

interface SavedProgress {
  query: string;
  step: number;
  search: BookingSearch;
  outbound: DepartureSlot | null;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  additionalPassengers: string[];
  specialNotes: string;
}

function loadProgress(query: string): SavedProgress | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedProgress;
    return saved.query === query && saved.search ? saved : null;
  } catch {
    return null;
  }
}

function clearProgress() {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

function slotHasLeft(slot: DepartureSlot): boolean {
  const now = new Date();
  const nowKey = `${localDateString(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return !!slot.date && `${slot.date}T${slot.time}` <= nowKey;
}

function BookingFlow() {
  const params = useSearchParams();

  const query = params.toString();
  // Progress saved before a refresh. A departure that has since left can't be
  // booked, so the rider picks again from Step 2.
  const [saved] = useState(() => loadProgress(query));
  const savedSlotsValid = !!saved?.outbound && !slotHasLeft(saved.outbound) &&
    (!saved.search.roundTrip || (!!saved.returnSlot && !slotHasLeft(saved.returnSlot)));

  const [step, setStep] = useState(() =>
    saved ? Math.min(Math.max(saved.step, 1), savedSlotsValid ? 4 : 2) : 1);
  const [search, setSearch] = useState<BookingSearch>(() => saved?.search ?? {
    from: (params.get("from") as "columbus" | "atl") || "columbus",
    to: (params.get("to") as "columbus" | "atl") || "atl",
    date: params.get("date") || "",
    returnDate: params.get("returnDate") || "",
    adults: Number(params.get("adults") || 1),
    children: Number(params.get("children") || 0),
    pets: Number(params.get("pets") || 0),
    extraBags: Number(params.get("extraBags") || 0),
    roundTrip: params.get("roundTrip") === "true",
    // Flight mode is the default; the homepage passes hasFlight=false to opt out.
    // Any dates chosen on the homepage seed the flight dates.
    hasFlight: params.get("hasFlight") !== "false",
    outboundFlight: { ...EMPTY_FLIGHT, date: params.get("date") || "" },
    returnFlight: { ...EMPTY_FLIGHT, date: params.get("returnDate") || "" },
  });
  const [outbound, setOutbound] = useState<DepartureSlot | null>(savedSlotsValid ? saved!.outbound : null);
  const [returnSlot, setReturnSlot] = useState<DepartureSlot | null>(savedSlotsValid ? saved!.returnSlot : null);
  const [primary, setPrimary] = useState<Passenger>(saved?.primary ?? { name: "", phone: "", email: "" });
  const [additionalPassengers, setAdditionalPassengers] = useState<string[]>(saved?.additionalPassengers ?? []);
  const [specialNotes, setSpecialNotes] = useState(saved?.specialNotes ?? "");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [military, setMilitary] = useState<MilitaryResult>({ applied: false, pending: false });
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    if (step >= 5) { clearProgress(); return; }
    const progress: SavedProgress = {
      query, step, search, outbound, returnSlot, primary, additionalPassengers, specialNotes,
    };
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
  }, [query, step, search, outbound, returnSlot, primary, additionalPassengers, specialNotes]);

  const handleDeparturesChange = useCallback((ob: DepartureSlot | null, ret: DepartureSlot | null) => {
    setOutbound(ob);
    setReturnSlot(ret);
  }, []);
  const handlePassengersChange = useCallback((p: Passenger, additional: string[], notes: string) => {
    setPrimary(p);
    setAdditionalPassengers(additional);
    setSpecialNotes(notes);
  }, []);

  // Completed steps (behind the current one) can be reopened; data is kept.
  const goToStep = (n: number) => {
    if (n < step && step < 5 && !checkoutBusy) setStep(n);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] grid-bg">
      {/* Top bar */}
      <div className="glass-dark border-b border-white/8 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-8 w-auto" priority />
          </Link>
          {step < 5 && (
            <span className="text-[#A1A1AA] text-sm">Step {step} of 4</span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {/* Yellow ambient glow */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#FCC300]/5 blur-[120px] pointer-events-none" />

        {step < 5 && (
          <div className="relative">
            <StepIndicator currentStep={step} onStepClick={checkoutBusy ? undefined : goToStep} />
          </div>
        )}

        <div className="relative glass rounded-2xl p-4 sm:p-6 lg:p-8">
          {step === 1 && (
            <Step1Search
              initial={search}
              onChange={setSearch}
              onNext={(s) => {
                setSearch(s);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <Step2Departures
              search={search}
              initialOutbound={outbound}
              initialReturn={returnSlot}
              onChange={handleDeparturesChange}
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
              initialPrimary={primary}
              initialAdditional={additionalPassengers}
              initialNotes={specialNotes}
              onChange={handlePassengersChange}
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
              onNext={(conf, mil) => {
                setConfirmationNumber(conf);
                setMilitary(mil);
                setStep(5);
              }}
              onBack={() => setStep(3)}
              onBusyChange={setCheckoutBusy}
            />
          )}

          {step === 5 && outbound && (
            <Step5Confirmation
              confirmationNumber={confirmationNumber}
              search={search}
              outbound={outbound}
              returnSlot={returnSlot}
              primary={primary}
              military={military}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BookingLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#FCC300]/30 border-t-[#FCC300] animate-spin" />
    </div>
  );
}

// Saved progress lives in browser storage, so the flow only renders in the
// browser — never pre-rendered with blank fields that then jump.
const noSubscribe = () => () => {};
function ClientOnlyBookingFlow() {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return inBrowser ? <BookingFlow /> : <BookingLoading />;
}

export default function BookPage() {
  return (
    <Suspense fallback={<BookingLoading />}>
      <ClientOnlyBookingFlow />
    </Suspense>
  );
}
