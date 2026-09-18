"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, CreditCard, Shield, AlertCircle, Loader2, BadgeCheck, Clock, Upload, ShieldCheck } from "lucide-react";
import {
  type BookingSearch,
  type Passenger,
  type DepartureSlot,
  type PriceBreakdown,
  calcPrice,
  money,
  LOCATIONS,
  formatDate,
} from "@/lib/booking";
import {
  MILITARY_CATEGORIES,
  MILITARY_ID_ACCEPT,
  isAllowedIdFile,
  type MilitaryCategory,
} from "@/lib/military";
import { getStripeClient } from "@/lib/stripe/client";
import { useAuth } from "@/context/AuthContext";

export interface MilitaryResult {
  applied: boolean;   // 5% taken off this booking now (verified account)
  pending: boolean;   // full price charged; 5% refunded once approved
}

interface Props {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  additionalPassengers: string[];
  specialNotes: string;
  onNext: (confirmationNumber: string, military: MilitaryResult) => void;
  onBack: () => void;
}

// ── Shared trip summary card ───────────────────────────────────────────────────
function TripSummary({
  search,
  outbound,
  returnSlot,
  primary,
  breakdown,
}: {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  breakdown: PriceBreakdown;
}) {
  const { lines, discountCents, total } = breakdown;
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="text-white font-semibold text-sm">Trip Summary</h3>
      <div className="space-y-2">
        {[
          {
            label: "Outbound",
            value: `${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short} · ${formatDate(search.date)} · ${outbound.displayTime}`,
          },
          ...(returnSlot
            ? [{
                label: "Return",
                value: `${LOCATIONS[search.to].short} → ${LOCATIONS[search.from].short} · ${formatDate(search.returnDate)} · ${returnSlot.displayTime}`,
              }]
            : []),
          { label: "Passenger", value: primary.name },
        ].map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-sm">
            <span className="text-[#A1A1AA] flex-shrink-0">{row.label}</span>
            <span className="text-white text-right">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-3 space-y-1.5">
        {lines.map((line) => (
          <div key={line.label} className="flex justify-between text-sm">
            <span className="text-[#A1A1AA]">{line.label}</span>
            <span className="text-white">${line.amount}</span>
          </div>
        ))}
        {discountCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-400">Military & First Responder (−5%)</span>
            <span className="text-green-400">−${money(discountCents / 100)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-2">
          <span className="text-white">Total Due</span>
          <span className="text-[#7C3AED] text-xl">${money(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Military & First Responder discount box ────────────────────────────────────
function MilitaryDiscountSection({
  approved,
  pending,
  checked,
  onCheckedChange,
  category,
  onCategoryChange,
  fileName,
  fileError,
  onFileChange,
}: {
  approved: boolean;
  pending: boolean;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  category: MilitaryCategory | "";
  onCategoryChange: (c: MilitaryCategory) => void;
  fileName: string;
  fileError: string;
  onFileChange: (f: File | null) => void;
}) {
  // Already verified — discount is automatic.
  if (approved) {
    return (
      <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl p-4">
        <BadgeCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-green-400 text-sm font-medium">Military & First Responder discount applied</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            Your account is verified — 5% is taken off every booking. Thank you for your service.
          </p>
        </div>
      </div>
    );
  }

  // Verification is under review — no discount this booking, applies to future ones.
  if (pending) {
    return (
      <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-4">
        <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 text-sm font-medium">Verification under review</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            We&apos;re reviewing your ID. Once approved, your 5% discount applies automatically to
            future bookings — and we&apos;ll refund the 5% on any booking you make in the meantime.
          </p>
        </div>
      </div>
    );
  }

  // Offer it — tick to submit an ID for review.
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#7C3AED] flex-shrink-0"
        />
        <span>
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <ShieldCheck className="w-4 h-4 text-[#7C3AED]" />
            I&apos;m active/veteran military or a first responder
          </span>
          <span className="block text-[#A1A1AA] text-xs mt-0.5">
            Get 5% off. Upload your ID for a quick review — this booking is charged full price today,
            and we refund the 5% once you&apos;re verified. You&apos;ll stay verified for future trips.
          </span>
        </span>
      </label>

      {checked && (
        <div className="space-y-3 pl-7">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">I am a…</Label>
            <div className="grid grid-cols-2 gap-2">
              {MILITARY_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onCategoryChange(c.value)}
                  className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                    category === c.value
                      ? "border-[#7C3AED] bg-[#7C3AED]/10"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <div className="text-white text-sm font-medium">{c.label}</div>
                  <div className="text-[#A1A1AA] text-[11px] leading-tight mt-0.5">{c.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Proof of service / department ID</Label>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 hover:border-[#7C3AED] px-3 py-3 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-[#7C3AED] flex-shrink-0" />
              <span className="text-sm text-[#A1A1AA] truncate">
                {fileName || "Upload a photo or PDF (JPG, PNG, HEIC, PDF · max 10 MB)"}
              </span>
              <input
                type="file"
                accept={MILITARY_ID_ACCEPT}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {fileError && <p className="text-red-400 text-xs mt-1.5">{fileError}</p>}
          </div>

          <p className="text-[#A1A1AA] text-[11px]">
            Your ID is stored privately and only used to verify eligibility.
          </p>
        </div>
      )}
    </div>
  );
}

function TrustBadges() {
  return (
    <div className="flex items-center justify-center gap-6">
      {[
        { icon: Shield, label: "SSL Encrypted" },
        { icon: Lock, label: "PCI Compliant" },
        { icon: CreditCard, label: "Powered by Stripe" },
      ].map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-1.5 text-[#A1A1AA] text-xs">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function TermsLine({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#7C3AED] flex-shrink-0"
      />
      <span className="text-[#A1A1AA] text-xs leading-relaxed">
        I have read and agree to Volt Transportation&apos;s{" "}
        <a href="/terms" target="_blank" className="text-[#7C3AED] hover:underline">Terms &amp; Conditions</a>
        {" "}and{" "}
        <a href="/safety-rules" target="_blank" className="text-[#7C3AED] hover:underline">Safety &amp; Rules</a>.
      </span>
    </label>
  );
}

// ── Real Stripe payment form (uses Payment Element) ────────────────────────────
function StripePaymentForm({
  total,
  onPaid,
  submitting,
  paymentError,
  blockedReason,
}: {
  total: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
  submitting: boolean;
  paymentError: string;
  blockedReason: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (blockedReason) { setError(blockedReason); return; }

    setError("");
    setProcessing(true);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.");
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Your payment could not be processed.");
      setProcessing(false);
      return;
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      await onPaid(paymentIntent.id);
    } else {
      setError("Payment was not completed. Please try again.");
    }
    setProcessing(false);
  };

  const busy = processing || submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-[#7C3AED]" />
          <h3 className="text-white font-semibold">Card Details</h3>
          <span className="ml-auto text-[#A1A1AA] text-xs flex items-center gap-1">
            <Lock className="w-3 h-3" /> SSL Encrypted
          </span>
        </div>

        {!ready && (
          <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading secure payment form…
          </div>
        )}
        <PaymentElement
          onReady={() => setReady(true)}
          options={{ layout: "tabs" }}
        />

        <p className="text-[#A1A1AA] text-xs flex items-start gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0 mt-0.5" />
          Your payment is encrypted and processed securely by Stripe. Volt never stores your card details.
        </p>
      </div>

      {(error || paymentError) && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error || paymentError}</p>
        </div>
      )}

      <div className="glass rounded-xl p-4">
        <TermsLine checked={termsAccepted} onChange={setTermsAccepted} />
      </div>

      <TrustBadges />

      <Button
        type="submit"
        disabled={!stripe || busy || !termsAccepted}
        size="lg"
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing payment…
          </span>
        ) : (
          <>
            <Lock className="mr-2 w-4 h-4" />
            Pay ${money(total)} · Confirm Booking
          </>
        )}
      </Button>
    </form>
  );
}

// ── Simulated payment form (no Stripe keys) ────────────────────────────────────
function SimulatedPaymentForm({
  total,
  primary,
  onPaid,
  submitting,
  paymentError,
  blockedReason,
}: {
  total: number;
  primary: Passenger;
  onPaid: (paymentIntentId: string) => Promise<void>;
  submitting: boolean;
  paymentError: string;
  blockedReason: string | null;
}) {
  const [cardName, setCardName] = useState(primary.name);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockedReason) { setError(blockedReason); return; }
    setError("");
    await onPaid(`pi_simulated_${Date.now()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-4">
        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 text-sm font-medium">Demo Mode — Payments Simulated</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            Stripe keys not yet connected. Click &quot;Complete Booking&quot; to finish the flow.
            Add real keys to <code className="text-yellow-400">.env.local</code> to process live payments.
          </p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-[#7C3AED]" />
          <h3 className="text-white font-semibold">Card Details</h3>
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Name on Card</Label>
          <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Smith"
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]" />
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Card Number</Label>
          <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242 (demo)"
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">Expiry</Label>
            <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM / YY"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl" />
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">CVV</Label>
            <Input value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="•••" maxLength={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl" />
          </div>
        </div>
        <p className="text-[#A1A1AA] text-xs flex items-start gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0 mt-0.5" />
          In production, your payment will be processed securely by Stripe. Volt never stores card details.
        </p>
      </div>

      {(error || paymentError) && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error || paymentError}</p>
        </div>
      )}

      <div className="glass rounded-xl p-4">
        <TermsLine checked={termsAccepted} onChange={setTermsAccepted} />
      </div>

      <TrustBadges />

      <Button
        type="submit"
        disabled={submitting || !termsAccepted}
        size="lg"
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating booking…
          </span>
        ) : (
          <>
            <Lock className="mr-2 w-4 h-4" />
            Complete Booking — ${money(total)}
          </>
        )}
      </Button>
    </form>
  );
}

// ── Parent orchestrator ────────────────────────────────────────────────────────
export default function Step4Checkout({
  search,
  outbound,
  returnSlot,
  primary,
  additionalPassengers,
  specialNotes,
  onNext,
  onBack,
}: Props) {
  const { customer, loading: authLoading } = useAuth();

  const militaryApproved = customer?.militaryStatus === "approved";
  const militaryPending = customer?.militaryStatus === "pending";

  // Military discount box state (only relevant when not already approved/pending).
  const [militaryChecked, setMilitaryChecked] = useState(false);
  const [militaryCategory, setMilitaryCategory] = useState<MilitaryCategory | "">("");
  const [militaryFile, setMilitaryFile] = useState<File | null>(null);
  const [militaryFileError, setMilitaryFileError] = useState("");

  // The discount only reduces THIS booking's price for verified accounts.
  const discountActive = militaryApproved;
  const breakdown = useMemo(
    () => calcPrice(search, { militaryDiscount: discountActive }),
    [search, discountActive],
  );

  // Someone ticking the box must pick a category + upload before paying.
  const needsUpload = !militaryApproved && !militaryPending && militaryChecked;
  const blockedReason = needsUpload && (!militaryCategory || !militaryFile)
    ? "Add your category and upload your ID to submit for the discount — or untick the box to continue at full price."
    : null;

  const [mode, setMode] = useState<"loading" | "simulated" | "real" | "error">("loading");
  const [clientSecret, setClientSecret] = useState("");
  const [initError, setInitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const stripePromise = useMemo<Promise<Stripe | null>>(() => getStripeClient(), []);

  const handleFileChange = (f: File | null) => {
    setMilitaryFileError("");
    if (!f) { setMilitaryFile(null); return; }
    const check = isAllowedIdFile(f.type, f.size);
    if (!check.ok) { setMilitaryFile(null); setMilitaryFileError(check.error ?? "Invalid file."); return; }
    setMilitaryFile(f);
  };

  // Create the PaymentIntent once auth has resolved, so approved riders are
  // charged the discounted amount from the start. The charged amount does not
  // change afterward (approval is locked; the opt-in box never discounts now).
  useEffect(() => {
    if (authLoading) return;

    const amountCents = calcPrice(search, { militaryDiscount: militaryApproved }).totalCents;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents,
            customerEmail: primary.email,
            customerName: primary.name,
            metadata: {
              tripFrom: LOCATIONS[search.from].label,
              tripTo: LOCATIONS[search.to].label,
              tripDate: search.date,
              tripTime: outbound.time,
              customerPhone: primary.phone,
              passengerName: primary.name.split(" ")[0],
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Payment initialization failed");
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        setMode(data.simulated ? "simulated" : "real");
      } catch (err) {
        if (cancelled) return;
        setInitError(err instanceof Error ? err.message : "Could not start checkout.");
        setMode("error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Create the reservation after payment succeeds.
  const finalizeBooking = async (paymentIntentId: string) => {
    setSubmitting(true);
    setPaymentError("");
    try {
      let bookingCustomerId = customer?.id ?? null;
      let requestDiscount = militaryApproved;   // verified → discount applies now
      let pendingResult = false;

      // Not-yet-verified rider opting in: submit the ID for review. The booking
      // is charged full price; the 5% is refunded once an owner/manager approves.
      if (needsUpload && militaryFile && militaryCategory) {
        try {
          const fd = new FormData();
          fd.append("file", militaryFile);
          fd.append("category", militaryCategory);
          const nameParts = primary.name.trim().split(/\s+/);
          fd.append("firstName", nameParts[0] ?? "");
          fd.append("lastName", nameParts.slice(1).join(" "));
          fd.append("email", primary.email ?? "");
          fd.append("phone", primary.phone ?? "");
          const upRes = await fetch("/api/military/upload", { method: "POST", body: fd });
          const upData = await upRes.json();
          if (upRes.ok && upData.customerId) {
            bookingCustomerId = upData.customerId;
            requestDiscount = true;
            pendingResult = true;
          }
          // If the upload fails we still complete the booking at full price so
          // the rider isn't blocked; they can submit their ID later from Profile.
        } catch {
          /* non-fatal — proceed without the military flag */
        }
      }

      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: outbound.id,
          returnTripId: returnSlot?.id ?? null,
          customerId: bookingCustomerId,
          adults: search.adults,
          children: search.children,
          pets: search.pets,
          extraBags: search.extraBags,
          isRoundTrip: search.roundTrip,
          primaryPassenger: primary,
          additionalPassengers,
          specialNotes,
          subtotalCents: breakdown.subtotalCents,
          totalCents: breakdown.totalCents,
          stripePaymentIntentId: paymentIntentId,
          militaryDiscountRequested: requestDiscount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking creation failed");
      onNext(data.confirmationNumber, { applied: discountActive, pending: pendingResult });
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? `${err.message} Your card was not charged for a duplicate — please contact us if you were billed.`
          : "Booking failed after payment. Please contact us."
      );
      setSubmitting(false);
    }
  };

  const elementsOptions: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#7C3AED",
        colorBackground: "#141414",
        colorText: "#ffffff",
        colorDanger: "#f87171",
        borderRadius: "12px",
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">Payment</h2>
          <p className="text-[#A1A1AA] text-sm">Secure checkout · Powered by Stripe</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <TripSummary search={search} outbound={outbound} returnSlot={returnSlot} primary={primary} breakdown={breakdown} />

      <MilitaryDiscountSection
        approved={militaryApproved}
        pending={militaryPending}
        checked={militaryChecked}
        onCheckedChange={setMilitaryChecked}
        category={militaryCategory}
        onCategoryChange={setMilitaryCategory}
        fileName={militaryFile?.name ?? ""}
        fileError={militaryFileError}
        onFileChange={handleFileChange}
      />

      {mode === "loading" && (
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Preparing secure checkout…</p>
        </div>
      )}

      {mode === "error" && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 text-sm font-medium">Checkout couldn&apos;t start</p>
            <p className="text-[#A1A1AA] text-xs mt-0.5">{initError}</p>
          </div>
        </div>
      )}

      {mode === "simulated" && (
        <SimulatedPaymentForm
          total={breakdown.total}
          primary={primary}
          onPaid={finalizeBooking}
          submitting={submitting}
          paymentError={paymentError}
          blockedReason={blockedReason}
        />
      )}

      {mode === "real" && clientSecret && (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <StripePaymentForm
            total={breakdown.total}
            onPaid={finalizeBooking}
            submitting={submitting}
            paymentError={paymentError}
            blockedReason={blockedReason}
          />
        </Elements>
      )}
    </div>
  );
}
