"use client";

// One-tap card payment for short pages (ride-along, tip after the trip):
// Stripe's Payment Element (cards, Apple Pay, Google Pay) and a pay button.
// `prepare` creates the PaymentIntent on the server when the rider presses
// pay; `onPaid` runs once Stripe confirms it. Without Stripe keys it's the
// local test mode: one button, no card.

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStripeClient } from "@/lib/stripe/client";

export interface PreparedPayment {
  clientSecret: string;
  paymentIntentId: string;
  simulated: boolean;
}

interface Props {
  amountCents: number;
  label: string;                       // "Pay $59.00"
  blockedReason?: string | null;       // shown instead of paying (missing details)
  prepare: () => Promise<PreparedPayment>;
  onPaid: (paymentIntentId: string) => Promise<void>;
}

const APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "night",
  variables: { colorPrimary: "#FCC300", colorBackground: "#141414", colorText: "#ffffff", colorDanger: "#f87171", borderRadius: "12px" },
};

export default function QuickCardPay(props: Props) {
  const stripePromise = useMemo<Promise<Stripe | null>>(() => getStripeClient(), []);
  const [mode, setMode] = useState<"loading" | "real" | "simulated">("loading");
  useEffect(() => {
    let cancelled = false;
    stripePromise.then((s) => { if (!cancelled) setMode(s ? "real" : "simulated"); });
    return () => { cancelled = true; };
  }, [stripePromise]);

  const options = useMemo<StripeElementsOptions>(() => ({
    mode: "payment",
    amount: Math.max(50, props.amountCents),
    currency: "usd",
    paymentMethodTypes: ["card"],
    appearance: APPEARANCE,
  }), [props.amountCents]);

  if (mode === "loading") {
    return (
      <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading secure payment…
      </div>
    );
  }
  if (mode === "simulated") return <PayForm {...props} stripe={null} elements={null} simulated />;
  return (
    <Elements stripe={stripePromise} options={options}>
      <StripePayForm {...props} />
    </Elements>
  );
}

// Stripe's hooks only work inside <Elements>, so the test mode skips them.
function StripePayForm(props: Props) {
  const stripe = useStripe();
  const elements = useElements();
  return <PayForm {...props} stripe={stripe} elements={elements} simulated={false} />;
}

function PayForm({ amountCents, label, blockedReason, prepare, onPaid, simulated, stripe, elements }: Props & {
  simulated: boolean;
  stripe: ReturnType<typeof useStripe>;
  elements: ReturnType<typeof useElements>;
}) {
  const [ready, setReady] = useState(simulated);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (blockedReason) { setError(blockedReason); return; }
    setError("");
    setBusy(true);
    try {
      if (simulated) {
        const p = await prepare();
        await onPaid(p.paymentIntentId);
        return;
      }
      if (!stripe || !elements) throw new Error("Payments are still loading — try again in a moment.");
      await elements.update({ amount: amountCents });
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message ?? "Please check your card details.");
      const p = await prepare();
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements, clientSecret: p.clientSecret, redirect: "if_required",
      });
      if (confirmError) throw new Error(confirmError.message ?? "Your payment could not be processed.");
      if (!paymentIntent || !["succeeded", "processing"].includes(paymentIntent.status)) {
        throw new Error("Payment was not completed. Please try again.");
      }
      await onPaid(paymentIntent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your payment could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay} className="space-y-4">
      {simulated ? (
        <p className="text-[#A1A1AA] text-xs bg-white/5 rounded-xl p-3">Test mode — Stripe isn&apos;t set up, so no card is charged.</p>
      ) : (
        <>
          {!ready && (
            <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading secure payment form…
            </div>
          )}
          <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />
        </>
      )}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      <Button type="submit" disabled={busy || !ready || amountCents <= 0} size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-14 text-base rounded-xl disabled:opacity-60">
        {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : <><Lock className="w-4 h-4 mr-2" />{label}</>}
      </Button>
    </form>
  );
}
