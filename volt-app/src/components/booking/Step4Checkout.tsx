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
import { ArrowLeft, Lock, CreditCard, Shield, AlertCircle, Loader2 } from "lucide-react";
import {
  type BookingSearch,
  type Passenger,
  type DepartureSlot,
  calcPrice,
  LOCATIONS,
  formatDate,
} from "@/lib/booking";
import { getStripeClient } from "@/lib/stripe/client";
import { useAuth } from "@/context/AuthContext";

interface Props {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  additionalPassengers: string[];
  specialNotes: string;
  onNext: (confirmationNumber: string) => void;
  onBack: () => void;
}

// ── Shared trip summary card ───────────────────────────────────────────────────
function TripSummary({
  search,
  outbound,
  returnSlot,
  primary,
}: {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
}) {
  const { lines, total } = calcPrice(search);
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="text-white font-semibold text-sm">Trip Summary</h3>
      <div className="space-y-2">
        {[
          { label: "Route", value: `${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short}` },
          { label: "Outbound", value: `${formatDate(search.date)} · ${outbound.displayTime}` },
          ...(returnSlot ? [{ label: "Return", value: `${formatDate(search.returnDate || search.date)} · ${returnSlot.displayTime}` }] : []),
          { label: "Passenger", value: primary.name },
        ].map((row) => (
          <div key={row.label} className="flex justify-between text-sm">
            <span className="text-[#A1A1AA]">{row.label}</span>
            <span className="text-white">{row.value}</span>
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
        <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-2">
          <span className="text-white">Total Due</span>
          <span className="text-[#7C3AED] text-xl">${total}</span>
        </div>
      </div>
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

function TermsLine() {
  return (
    <p className="text-center text-[#A1A1AA] text-xs">
      By completing this booking you agree to our{" "}
      <a href="/terms" target="_blank" className="text-[#7C3AED] hover:underline">Terms &amp; Conditions</a>
      {" "}and{" "}
      <a href="/safety-rules" target="_blank" className="text-[#7C3AED] hover:underline">Safety &amp; Rules</a>.
    </p>
  );
}

// ── Real Stripe payment form (uses Payment Element) ────────────────────────────
function StripePaymentForm({
  total,
  onPaid,
  submitting,
  paymentError,
}: {
  total: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
  submitting: boolean;
  paymentError: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setError("");
    setProcessing(true);

    // Validate the card fields
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.");
      setProcessing(false);
      return;
    }

    // Confirm the payment without leaving the page when possible
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
      // Hand off to booking creation; parent controls the spinner from here
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

      <TrustBadges />

      <Button
        type="submit"
        disabled={!stripe || busy}
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
            Pay ${total} · Confirm Booking
          </>
        )}
      </Button>

      <TermsLine />
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
}: {
  total: number;
  primary: Passenger;
  onPaid: (paymentIntentId: string) => Promise<void>;
  submitting: boolean;
  paymentError: string;
}) {
  const [cardName, setCardName] = useState(primary.name);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In simulated mode there is no PaymentIntent to confirm; the create-intent
    // route already returned a simulated id which booking/create will record.
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

      {paymentError && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{paymentError}</p>
        </div>
      )}

      <TrustBadges />

      <Button
        type="submit"
        disabled={submitting}
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
            Complete Booking — ${total}
          </>
        )}
      </Button>

      <TermsLine />
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
  const { customer } = useAuth();
  const { total } = calcPrice(search);

  const [mode, setMode] = useState<"loading" | "simulated" | "real" | "error">("loading");
  const [clientSecret, setClientSecret] = useState("");
  const [initError, setInitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const stripePromise = useMemo<Promise<Stripe | null>>(() => getStripeClient(), []);

  // Create the PaymentIntent up front so the Payment Element can mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents: total * 100,
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
  }, []);

  // Shared: create the reservation after payment succeeds.
  const finalizeBooking = async (paymentIntentId: string) => {
    setSubmitting(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: outbound.id,
          returnTripId: returnSlot?.id ?? null,
          customerId: customer?.id ?? null,
          adults: search.adults,
          children: search.children,
          pets: search.pets,
          extraBags: search.extraBags,
          isRoundTrip: search.roundTrip,
          primaryPassenger: primary,
          additionalPassengers,
          specialNotes,
          subtotalCents: total * 100,
          totalCents: total * 100,
          stripePaymentIntentId: paymentIntentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Booking creation failed");
      onNext(data.confirmationNumber);
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

      <TripSummary search={search} outbound={outbound} returnSlot={returnSlot} primary={primary} />

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
          total={total}
          primary={primary}
          onPaid={finalizeBooking}
          submitting={submitting}
          paymentError={paymentError}
        />
      )}

      {mode === "real" && clientSecret && (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <StripePaymentForm
            total={total}
            onPaid={finalizeBooking}
            submitting={submitting}
            paymentError={paymentError}
          />
        </Elements>
      )}
    </div>
  );
}
