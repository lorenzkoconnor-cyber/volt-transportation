"use client";

// Card entry for staff (phone / counter bookings). Card details go straight to
// Stripe — Volt never sees or stores them. The parent drives it through a ref:
//   validate() → error message or null (before anything is saved)
//   charge(paymentId) → resolves once the pending card payment is paid; throws
//                       with Stripe's message on a decline (safe to call again)

import { useEffect, useImperativeHandle, useState } from "react";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe/client";
import { CreditCard, Lock, Loader2 } from "lucide-react";

export interface StaffCardHandle {
  validate: () => string | null;
  charge: (paymentId: string) => Promise<void>;
}

async function callStaffCard(action: "intent" | "confirm", paymentId: string) {
  const res = await fetch("/api/payments/staff-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, paymentId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Card payment failed.");
  return data;
}

const stripePromise = getStripeClient();

export function StaffCardPayment({ amountCents, ref }: { amountCents: number; ref?: React.Ref<StaffCardHandle> }) {
  const [mode, setMode] = useState<"loading" | "simulated" | "real">("loading");
  useEffect(() => {
    let cancelled = false;
    stripePromise.then((s) => { if (!cancelled) setMode(s ? "real" : "simulated"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white/3 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-[#FCC300]" />
        <span className="text-white text-sm font-medium">Card · ${(amountCents / 100).toFixed(2)}</span>
        <span className="ml-auto text-[#A1A1AA] text-xs flex items-center gap-1">
          <Lock className="w-3 h-3" /> Processed by Stripe
        </span>
      </div>
      {mode === "loading" && (
        <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading card form…
        </div>
      )}
      {mode === "simulated" && <SimulatedCard ref={ref} />}
      {mode === "real" && (
        <Elements stripe={stripePromise}>
          <RealCard ref={ref} />
        </Elements>
      )}
    </div>
  );
}

function RealCard({ ref }: { ref?: React.Ref<StaffCardHandle> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [complete, setComplete] = useState(false);
  const [cardError, setCardError] = useState("");

  useImperativeHandle(ref, () => ({
    validate: () => {
      if (!stripe || !elements) return "Card form is still loading.";
      if (cardError) return cardError;
      if (!complete) return "Enter the full card number, expiry, CVC and ZIP.";
      return null;
    },
    charge: async (paymentId: string) => {
      const card = elements?.getElement(CardElement);
      if (!stripe || !card) throw new Error("Card form is still loading.");
      const { clientSecret } = await callStaffCard("intent", paymentId);
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
      if (error) throw new Error(error.message ?? "The card was declined.");
      if (paymentIntent?.status !== "succeeded") throw new Error("The card was not charged. Please try again.");
      await callStaffCard("confirm", paymentId);
    },
  }), [stripe, elements, complete, cardError]);

  return (
    <div className="space-y-2">
      <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 focus-within:border-[#FCC300]">
        <CardElement
          onChange={(e) => { setComplete(e.complete); setCardError(e.error?.message ?? ""); }}
          options={{
            // No Link autofill — it could fill a saved card that isn't the customer's.
            disableLink: true,
            style: {
              base: { color: "#ffffff", fontSize: "15px", iconColor: "#FCC300", "::placeholder": { color: "#71717A" } },
              invalid: { color: "#f87171", iconColor: "#f87171" },
            },
          }}
        />
      </div>
      {cardError && <p className="text-red-400 text-xs">{cardError}</p>}
    </div>
  );
}

// No Stripe keys (local dev): nothing to type — the charge is recorded as simulated.
function SimulatedCard({ ref }: { ref?: React.Ref<StaffCardHandle> }) {
  useImperativeHandle(ref, () => ({
    validate: () => null,
    charge: async (paymentId: string) => {
      await callStaffCard("intent", paymentId);
      await callStaffCard("confirm", paymentId);
    },
  }), []);
  return (
    <p className="text-[#A1A1AA] text-xs">
      Stripe isn&apos;t configured here — the card charge will be simulated.
    </p>
  );
}
