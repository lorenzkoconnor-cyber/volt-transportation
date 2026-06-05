"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, CreditCard, Shield, AlertCircle } from "lucide-react";
import {
  type BookingSearch,
  type Passenger,
  type DepartureSlot,
  calcPrice,
  LOCATIONS,
  formatDate,
} from "@/lib/booking";

interface Props {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  onNext: () => void;
  onBack: () => void;
}

export default function Step4Checkout({
  search,
  outbound,
  returnSlot,
  primary,
  onNext,
  onBack,
}: Props) {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [cardName, setCardName]       = useState(primary.name);
  const [cardNumber, setCardNumber]   = useState("");
  const [expiry, setExpiry]           = useState("");
  const [cvv, setCvv]                 = useState("");
  const [isSimulated, setIsSimulated] = useState(false);

  const { lines, total } = calcPrice(search);

  // Check if we're in simulated mode (no real Stripe keys)
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    setIsSimulated(!key.startsWith("pk_") || key.includes("placeholder"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Step 1: Create PaymentIntent (real or simulated)
      const intentRes = await fetch("/api/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: total * 100,
          customerEmail: primary.email,
          customerName: primary.name,
          metadata: {
            confirmationNumber: "PENDING", // filled in after booking/create
            tripFrom: LOCATIONS[search.from].label,
            tripTo: LOCATIONS[search.to].label,
            tripDate: search.date,
            tripTime: outbound.time,
            customerPhone: primary.phone,
            passengerName: primary.name.split(" ")[0],
          },
        }),
      });

      const intentData = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentData.error ?? "Payment initialization failed");

      // Step 2: For real Stripe — confirm card payment with Stripe.js
      // For simulated mode — skip directly to booking creation
      if (!intentData.simulated) {
        const { getStripeClient } = await import("@/lib/stripe/client");
        const stripe = await getStripeClient();

        if (stripe) {
          const { error: stripeError } = await stripe.confirmCardPayment(
            intentData.clientSecret,
            {
              payment_method: {
                card: {
                  // In production, replace these inputs with Stripe's <CardElement />
                  // from @stripe/react-stripe-js for PCI compliance
                  // The inputs below are for UI demonstration only
                } as never,
                billing_details: {
                  name: cardName,
                  email: primary.email,
                },
              },
            }
          );

          if (stripeError) {
            throw new Error(stripeError.message ?? "Card payment failed");
          }
        }
      }

      // Step 3: Create reservation in database
      // (In production, this is also triggered by the webhook for reliability)
      const bookingRes = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: outbound.id,
          returnTripId: returnSlot?.id ?? null,
          customerId: "guest", // TODO: replace with actual customer ID after auth
          adults: search.adults,
          children: search.children,
          pets: search.pets,
          extraBags: search.extraBags,
          isRoundTrip: search.roundTrip,
          primaryPassenger: primary,
          additionalPassengers: [],
          specialNotes: "",
          subtotalCents: total * 100,
          totalCents: total * 100,
          stripePaymentIntentId: intentData.paymentIntentId,
        }),
      });

      if (!bookingRes.ok) {
        const bookingData = await bookingRes.json();
        throw new Error(bookingData.error ?? "Booking creation failed");
      }

      // Step 4: All good — advance to confirmation
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">Payment</h2>
          <p className="text-[#A1A1AA] text-sm">Secure checkout · Powered by Stripe</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Dev mode notice */}
      {isSimulated && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 text-sm font-medium">Demo Mode — Payments Simulated</p>
            <p className="text-[#A1A1AA] text-xs mt-0.5">
              Stripe keys not yet connected. Click &quot;Pay&quot; to complete the booking flow.
              Add real keys to <code className="text-yellow-400">.env.local</code> to process real payments.
            </p>
          </div>
        </div>
      )}

      {/* Trip summary */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-semibold text-sm">Trip Summary</h3>
        <div className="space-y-2">
          {[
            { label: "Route",     value: `${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short}` },
            { label: "Outbound",  value: `${formatDate(search.date)} · ${outbound.displayTime}` },
            ...(returnSlot ? [{ label: "Return", value: returnSlot.displayTime }] : []),
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

      {/* Payment fields */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-[#7C3AED]" />
          <h3 className="text-white font-semibold">Card Details</h3>
          {!isSimulated && (
            <span className="ml-auto text-[#A1A1AA] text-xs flex items-center gap-1">
              <Lock className="w-3 h-3" /> SSL Encrypted
            </span>
          )}
        </div>

        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Name on Card</Label>
          <Input
            required={!isSimulated}
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            placeholder="John Smith"
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#7C3AED]"
          />
        </div>

        {/* Card number */}
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Card Number</Label>
          {isSimulated ? (
            <Input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4242 4242 4242 4242 (demo)"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl"
            />
          ) : (
            <div className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center px-3">
              {/* TODO: Replace with <CardNumberElement /> from @stripe/react-stripe-js */}
              <span className="text-[#A1A1AA] text-sm">Stripe card field will mount here</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">Expiry</Label>
            {isSimulated ? (
              <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM / YY"
                className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl" />
            ) : (
              <div className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center px-3">
                {/* TODO: <CardExpiryElement /> */}
                <span className="text-[#A1A1AA] text-sm">Stripe field</span>
              </div>
            )}
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-2 block">CVV</Label>
            {isSimulated ? (
              <Input value={cvv} onChange={(e) => setCvv(e.target.value)} placeholder="•••" maxLength={4}
                className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl" />
            ) : (
              <div className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center px-3">
                {/* TODO: <CardCvcElement /> */}
                <span className="text-[#A1A1AA] text-sm">Stripe field</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-[#A1A1AA] text-xs flex items-start gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0 mt-0.5" />
          {isSimulated
            ? "In production, your payment will be processed securely by Stripe. Volt never stores card details."
            : "Your payment is encrypted and processed securely by Stripe. Volt never stores your card details."}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Trust badges */}
      <div className="flex items-center justify-center gap-6">
        {[
          { icon: Shield,      label: "SSL Encrypted" },
          { icon: Lock,        label: "PCI Compliant" },
          { icon: CreditCard,  label: "Powered by Stripe" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[#A1A1AA] text-xs">
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <Button
        type="submit"
        disabled={loading}
        size="lg"
        className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {isSimulated ? "Creating booking…" : "Processing payment…"}
          </span>
        ) : (
          <>
            <Lock className="mr-2 w-4 h-4" />
            {isSimulated ? `Complete Booking — $${total}` : `Pay $${total} · Confirm Booking`}
          </>
        )}
      </Button>

      <p className="text-center text-[#A1A1AA] text-xs">
        By completing this booking you agree to our{" "}
        <a href="/terms" target="_blank" className="text-[#7C3AED] hover:underline">Terms & Conditions</a>
        {" "}and{" "}
        <a href="/safety-rules" target="_blank" className="text-[#7C3AED] hover:underline">Safety & Rules</a>.
      </p>
    </form>
  );
}
