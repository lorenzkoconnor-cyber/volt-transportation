"use client";

// One-tap card payment for short pages (ride-along, tip after the trip):
// the same Card | Apple Pay | Google Pay tabs as checkout (Step4Checkout).
// `prepare` creates the PaymentIntent on the server when the rider presses
// pay; `onPaid` runs once Stripe confirms it. Without Stripe keys it's the
// local test mode: one button, no card.

import { useEffect, useMemo, useState } from "react";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions, StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";
import { PAY_METHODS, type PayMethod } from "@/components/booking/PayMethods";
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
  // Wording on the Apple Pay button (Google Pay has no "tip" style, so it says "Pay").
  walletButton?: "tip" | "book";
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

function PayForm({ amountCents, label, blockedReason, prepare, onPaid, walletButton = "book", simulated, stripe, elements }: Props & {
  simulated: boolean;
  stripe: ReturnType<typeof useStripe>;
  elements: ReturnType<typeof useElements>;
}) {
  const [ready, setReady] = useState(simulated);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Our own tabs, like checkout: Stripe's built-in ones bundle Link's Bank and
  // Klarna, so the card form runs with wallets off and Apple Pay / Google Pay
  // get their own Express Checkout button.
  const [method, setMethod] = useState<PayMethod>("card");
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const pickMethod = (m: PayMethod) => { setMethod(m); setWalletAvailable(null); setError(""); };
  const walletName = method === "applePay" ? "Apple Pay" : "Google Pay";

  // Card form and wallets share one path: submit → create the intent → confirm.
  const charge = async (express?: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements) throw new Error("Payments are still loading — try again in a moment.");
    if (!express) await elements.update({ amount: amountCents });
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
  };

  const run = async (express?: StripeExpressCheckoutElementConfirmEvent) => {
    if (busy) return;
    if (blockedReason) { setError(blockedReason); express?.paymentFailed({ reason: "fail" }); return; }
    setError("");
    setBusy(true);
    try {
      if (simulated) {
        const p = await prepare();
        await onPaid(p.paymentIntentId);
        return;
      }
      await charge(express);
    } catch (err) {
      express?.paymentFailed({ reason: "fail" });
      setError(err instanceof Error ? err.message : "Your payment could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const pay = (e: React.FormEvent) => { e.preventDefault(); void run(); };

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
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Payment method">
            {PAY_METHODS.map(({ id, label: name, Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={method === id} disabled={busy}
                onClick={() => pickMethod(id)}
                className={`flex flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${
                  method === id
                    ? "bg-[#FCC300] border-[#FCC300] text-[#0A0A0A] font-semibold"
                    : "bg-[#141414] border-white/10 text-[#A1A1AA] hover:text-white hover:border-white/20"
                }`}>
                <Icon className="w-4 h-4" />
                {name}
              </button>
            ))}
          </div>

          {/* Stays mounted on the wallet tabs so the Elements group keeps working. */}
          <div className={method === "card" ? undefined : "hidden"}>
            {!ready && (
              <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading secure payment form…
              </div>
            )}
            <PaymentElement onReady={() => setReady(true)}
              options={{ layout: "tabs", wallets: { link: "never", applePay: "never", googlePay: "never" } }} />
          </div>

          {method !== "card" && (
            <div className="space-y-2">
              {walletAvailable === null && (
                <div className="flex items-center gap-2 text-[#A1A1AA] text-sm py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading {walletName}…
                </div>
              )}
              {walletAvailable === false && (
                <p className="text-[#A1A1AA] text-sm text-center py-4">
                  {walletName} isn&apos;t available on this device or browser. Please choose Card.
                </p>
              )}
              <div className={busy || amountCents <= 0 ? "opacity-50 pointer-events-none" : undefined}>
                <ExpressCheckoutElement
                  key={method}
                  options={{
                    paymentMethods: {
                      applePay: method === "applePay" ? "always" : "never",
                      googlePay: method === "googlePay" ? "always" : "never",
                      link: "never", paypal: "never", amazonPay: "never", klarna: "never",
                    },
                    buttonType: { applePay: walletButton, googlePay: walletButton === "tip" ? "pay" : "book" },
                    buttonTheme: { applePay: "white", googlePay: "white" },
                    buttonHeight: 52,
                  }}
                  onReady={(e) => setWalletAvailable(!!e.availablePaymentMethods?.[method])}
                  onClick={(e) => {
                    if (busy) return;
                    if (blockedReason) { setError(blockedReason); return; }
                    e.resolve();
                  }}
                  onConfirm={(e) => run(e)}
                />
              </div>
              {walletAvailable && (
                <p className="text-[#A1A1AA] text-xs text-center">
                  {method === "applePay"
                    ? "On a computer, Apple Pay shows a code to scan with your iPhone."
                    : "Google Pay opens a secure Google window to finish."}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {(simulated || method === "card") && <Button type="submit" disabled={busy || !ready || amountCents <= 0} size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-14 text-base rounded-xl disabled:opacity-60">
        {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</> : <><Lock className="w-4 h-4 mr-2" />{label}</>}
      </Button>}
    </form>
  );
}
