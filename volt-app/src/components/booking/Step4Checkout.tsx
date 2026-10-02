"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { ArrowLeft, Lock, CreditCard, Shield, AlertCircle, Loader2, BadgeCheck, Clock, Upload, ShieldCheck, Ticket, X } from "lucide-react";
import {
  type BookingSearch,
  type Passenger,
  type DepartureSlot,
  type PriceBreakdown,
  calcPrice,
  money,
  MILITARY_DISCOUNT_PERCENT,
  LOCATIONS,
  formatDate,
  bookingFlights,
  flightDirection,
  flightSummary,
  slotTimes,
} from "@/lib/booking";
import {
  MILITARY_CATEGORIES,
  MILITARY_ID_ACCEPT,
  isAllowedIdFile,
  type MilitaryCategory,
} from "@/lib/military";
import { getStripeClient } from "@/lib/stripe/client";
import { codeDiscountCents, codeLabel, type DiscountCodeTerms } from "@/lib/discount-codes";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export interface MilitaryResult {
  applied: boolean;   // discount taken off this booking now (verified account)
  pending: boolean;   // card held for the full fare; captured at 90% once approved
  code?: AppliedCode | null;   // a one-time discount code was used instead
}

export interface AppliedCode extends DiscountCodeTerms {
  code: string;            // normalized, e.g. "K7MPQ2XR"
  discountCents?: number;  // filled in once applied to this booking
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
  // Payment or booking in flight — the page locks step navigation meanwhile.
  onBusyChange?: (busy: boolean) => void;
}

// ── Shared trip summary card ───────────────────────────────────────────────────
function TripSummary({
  search,
  outbound,
  returnSlot,
  primary,
  breakdown,
  hold,
  discountedIfApproved,
  discountLabel,
}: {
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
  breakdown: PriceBreakdown;
  hold: boolean;
  discountedIfApproved: number;
  discountLabel: string;
}) {
  const { lines, discountCents, total } = breakdown;
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="text-white font-semibold text-sm">Trip Summary</h3>
      <div className="space-y-2">
        {[
          {
            label: "Outbound",
            value: `${LOCATIONS[search.from].short} → ${LOCATIONS[search.to].short} · ${formatDate(outbound.date || search.date)} · ${slotTimes(outbound, search.to)}`,
          },
          ...(search.hasFlight
            ? [{ label: returnSlot ? "Outbound Flight" : "Flight", value: flightSummary(search.outboundFlight, flightDirection(search.from)) }]
            : []),
          ...(returnSlot
            ? [{
                label: "Return",
                value: `${LOCATIONS[search.to].short} → ${LOCATIONS[search.from].short} · ${formatDate(returnSlot.date || search.returnDate)} · ${slotTimes(returnSlot, search.from)}`,
              }]
            : []),
          ...(returnSlot && search.hasFlight
            ? [{ label: "Return Flight", value: flightSummary(search.returnFlight, flightDirection(search.to)) }]
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
            <span className="text-green-400">{discountLabel}</span>
            <span className="text-green-400">−${money(discountCents / 100)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-white/10 pt-2 mt-2">
          <span className="text-white">{hold ? "Card Hold Today" : "Total Due"}</span>
          <span className="text-[#FCC300] text-xl">${money(total)}</span>
        </div>
        {hold && (
          <p className="text-[#A1A1AA] text-xs leading-relaxed">
            Your card is authorized, not charged. Once your ID is verified we charge only{" "}
            <span className="text-green-400 font-medium">${money(discountedIfApproved)}</span>{" "}
            ({MILITARY_DISCOUNT_PERCENT}% off). If it can&apos;t be verified, the full ${money(total)} is charged.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Military discount box ──────────────────────────────────────────────────────
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
          <p className="text-green-400 text-sm font-medium">Military discount applied</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">
            Your account is verified — {MILITARY_DISCOUNT_PERCENT}% is taken off every booking. Thank you for your service.
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
            We&apos;re reviewing your ID. For this booking we&apos;ll place a hold on your card for the full fare —
            once you&apos;re approved we charge only {100 - MILITARY_DISCOUNT_PERCENT}% of it, and future bookings get{" "}
            {MILITARY_DISCOUNT_PERCENT}% off automatically.
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
          className="mt-0.5 w-4 h-4 accent-[#FCC300] flex-shrink-0"
        />
        <span>
          <span className="flex items-center gap-1.5 text-white text-sm font-medium">
            <ShieldCheck className="w-4 h-4 text-[#FCC300]" />
            I&apos;m active-duty or retired military
          </span>
          <span className="block text-[#A1A1AA] text-xs mt-0.5">
            Get {MILITARY_DISCOUNT_PERCENT}% off. Upload your military ID for a quick review — today we only place a hold on
            your card for the full fare. Once you&apos;re verified we charge {100 - MILITARY_DISCOUNT_PERCENT}% of it; if we
            can&apos;t verify, the full fare is charged. You&apos;ll stay verified for future trips.{" "}
            <Link href="/military" target="_blank" className="text-[#FCC300] hover:underline">Who qualifies?</Link>
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
                      ? "border-[#FCC300] bg-[#FCC300]/10"
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
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Military ID (active-duty or retiree)</Label>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 hover:border-[#FCC300] px-3 py-3 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 text-[#FCC300] flex-shrink-0" />
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

// ── One-time discount code ─────────────────────────────────────────────────────
function DiscountCodeSection({
  applied,
  onApplied,
  onRemove,
  externalError,
  disabled,
  smallerThanMilitary,
}: {
  applied: AppliedCode | null;
  onApplied: (c: AppliedCode) => void;
  onRemove: () => void;
  externalError: string;
  disabled: boolean;
  smallerThanMilitary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const apply = async () => {
    if (!input.trim()) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That code isn't valid.");
      onApplied({ code: data.code, type: data.type, value: data.value });
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code isn't valid.");
    }
    setChecking(false);
  };

  if (applied) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl p-4">
          <Ticket className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-400 text-sm font-medium">
              Code <span className="font-mono">{applied.code}</span> applied — {codeLabel(applied)}
            </p>
            <p className="text-[#A1A1AA] text-xs mt-0.5">
              One-time code. It&apos;s used up once this booking is confirmed. Codes can&apos;t be combined with the
              Military Discount.
            </p>
          </div>
          <button type="button" onClick={onRemove} disabled={disabled}
            className="text-[#A1A1AA] hover:text-white transition-colors disabled:opacity-50" aria-label="Remove code">
            <X className="w-4 h-4" />
          </button>
        </div>
        {smallerThanMilitary && (
          <p className="text-yellow-400 text-xs px-1">
            Your {MILITARY_DISCOUNT_PERCENT}% military discount saves more than this code — remove the code to keep it.
          </p>
        )}
      </div>
    );
  }

  const shownError = error || externalError;
  return (
    <div className="glass rounded-2xl p-5">
      {!open && !shownError ? (
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-white transition-colors">
          <Ticket className="w-4 h-4 text-[#FCC300]" />
          Have a discount code from Volt?
        </button>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-white text-sm font-medium">
            <Ticket className="w-4 h-4 text-[#FCC300]" /> Discount code
          </label>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
              placeholder="Enter code"
              maxLength={30}
              autoComplete="off"
              className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl font-mono tracking-wider focus:border-[#FCC300]"
            />
            <Button type="button" onClick={apply} disabled={checking || !input.trim() || disabled}
              className="bg-white/10 hover:bg-white/15 text-white h-11 rounded-xl px-5">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
          {shownError && <p className="text-red-400 text-xs">{shownError}</p>}
        </div>
      )}
    </div>
  );
}

// ── Free booking (a discount code covers the whole fare) ───────────────────────
function FreeBookingForm({
  prepareIntent,
  finalize,
  submitting,
  paymentError,
  onProcessingChange,
}: {
  prepareIntent: PrepareIntent;
  finalize: FinalizeBooking;
  submitting: boolean;
  paymentError: string;
  onProcessingChange: (processing: boolean) => void;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  useEffect(() => onProcessingChange(processing), [processing, onProcessingChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (processing || submitting) return;
    setError("");
    setProcessing(true);
    try {
      const intent = await prepareIntent();
      if (!intent.free) throw new Error("This booking now needs a payment. Please refresh and try again.");
      await finalize(intent.checkoutId, intent.paymentIntentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    }
    setProcessing(false);
  };

  const busy = processing || submitting;
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl p-4">
        <BadgeCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-green-400 text-sm font-medium">No payment needed</p>
          <p className="text-[#A1A1AA] text-xs mt-0.5">Your discount code covers the whole fare — no card required.</p>
        </div>
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

      <Button
        type="submit"
        disabled={busy || !termsAccepted}
        size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Confirming booking…</span>
        ) : (
          <>Confirm Free Booking</>
        )}
      </Button>
    </form>
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
        className="mt-0.5 w-4 h-4 accent-[#FCC300] flex-shrink-0"
      />
      <span className="text-[#A1A1AA] text-xs leading-relaxed">
        I have read and agree to Volt Transportation&apos;s{" "}
        <a href="/terms" target="_blank" className="text-[#FCC300] hover:underline">Terms &amp; Conditions</a>
        {" "}and{" "}
        <a href="/safety-rules" target="_blank" className="text-[#FCC300] hover:underline">Safety &amp; Rules</a>.
      </span>
    </label>
  );
}

// ── Checkout plumbing shared by both payment forms ─────────────────────────────
// The PaymentIntent is created only when the rider clicks Pay (Stripe's
// "deferred intent" flow), so its amount and capture mode always reflect the
// final state of the Military Discount box.
interface PreparedIntent {
  checkoutId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  captureMethod: "automatic" | "manual";
  simulated: boolean;
  free: boolean;   // discount code covers the whole fare — no card
}
type PrepareIntent = () => Promise<PreparedIntent>;
type FinalizeBooking = (checkoutId: string, paymentIntentId: string) => Promise<void>;

function payLabel(total: number, hold: boolean): string {
  return hold ? `Authorize $${money(total)} · Confirm Booking` : `Pay $${money(total)} · Confirm Booking`;
}

// ── Real Stripe payment form (uses Payment Element) ────────────────────────────
function StripePaymentForm({
  total,
  hold,
  prepareIntent,
  finalize,
  submitting,
  paymentError,
  blockedReason,
  onProcessingChange,
}: {
  total: number;
  hold: boolean;
  prepareIntent: PrepareIntent;
  finalize: FinalizeBooking;
  submitting: boolean;
  paymentError: string;
  onProcessingChange: (processing: boolean) => void;
  blockedReason: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  useEffect(() => onProcessingChange(processing), [processing, onProcessingChange]);
  const [ready, setReady] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || processing || submitting) return;
    if (blockedReason) { setError(blockedReason); return; }

    setError("");
    setProcessing(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message ?? "Please check your card details.");

      const intent = await prepareIntent();

      // The server has the final say on amount + capture mode (e.g. an account
      // approved in the meantime). Re-sync the Payment Element if it differs.
      if (intent.amountCents !== Math.round(total * 100) || intent.captureMethod !== (hold ? "manual" : "automatic")) {
        await elements.update({ amount: intent.amountCents, captureMethod: intent.captureMethod });
        const { error: resubmitError } = await elements.submit();
        if (resubmitError) throw new Error(resubmitError.message ?? "Please check your card details.");
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        redirect: "if_required",
      });
      if (confirmError) throw new Error(confirmError.message ?? "Your payment could not be processed.");

      if (paymentIntent && ["succeeded", "requires_capture", "processing"].includes(paymentIntent.status)) {
        await finalize(intent.checkoutId, paymentIntent.id);
      } else {
        throw new Error("Payment was not completed. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your payment could not be processed.");
    }
    setProcessing(false);
  };

  const busy = processing || submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-[#FCC300]" />
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
          <Lock className="w-3.5 h-3.5 text-[#FCC300] flex-shrink-0 mt-0.5" />
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
        disabled={!stripe || !ready || busy || !termsAccepted}
        size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing payment…
          </span>
        ) : (
          <>
            <Lock className="mr-2 w-4 h-4" />
            {payLabel(total, hold)}
          </>
        )}
      </Button>
    </form>
  );
}

// ── Simulated payment form (no Stripe keys) ────────────────────────────────────
function SimulatedPaymentForm({
  total,
  hold,
  primary,
  prepareIntent,
  finalize,
  submitting,
  paymentError,
  blockedReason,
  onProcessingChange,
}: {
  total: number;
  hold: boolean;
  primary: Passenger;
  prepareIntent: PrepareIntent;
  finalize: FinalizeBooking;
  submitting: boolean;
  paymentError: string;
  onProcessingChange: (processing: boolean) => void;
  blockedReason: string | null;
}) {
  const [cardName, setCardName] = useState(primary.name);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  useEffect(() => onProcessingChange(processing), [processing, onProcessingChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (processing || submitting) return;
    if (blockedReason) { setError(blockedReason); return; }
    setError("");
    setProcessing(true);
    try {
      const intent = await prepareIntent();
      await finalize(intent.checkoutId, intent.paymentIntentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    }
    setProcessing(false);
  };

  const busy = processing || submitting;

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
          <CreditCard className="w-4 h-4 text-[#FCC300]" />
          <h3 className="text-white font-semibold">Card Details</h3>
        </div>
        <div>
          <Label className="text-[#A1A1AA] text-xs mb-2 block">Name on Card</Label>
          <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="John Smith"
            className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-11 rounded-xl focus:border-[#FCC300]" />
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
          <Lock className="w-3.5 h-3.5 text-[#FCC300] flex-shrink-0 mt-0.5" />
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
        disabled={busy || !termsAccepted}
        size="lg"
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-14 text-base rounded-xl disabled:opacity-60"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating booking…
          </span>
        ) : (
          <>
            <Lock className="mr-2 w-4 h-4" />
            {hold ? `Complete Booking — hold $${money(total)}` : `Complete Booking — $${money(total)}`}
          </>
        )}
      </Button>
    </form>
  );
}

// ── Parent orchestrator ────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Step4Checkout({
  search,
  outbound,
  returnSlot,
  primary,
  additionalPassengers,
  specialNotes,
  onNext,
  onBack,
  onBusyChange,
}: Props) {
  const { customer } = useAuth();

  const militaryApproved = customer?.militaryStatus === "approved";
  const militaryPending = customer?.militaryStatus === "pending";

  // Military discount box state (only relevant when not already approved/pending).
  const [militaryChecked, setMilitaryChecked] = useState(false);
  const [militaryCategory, setMilitaryCategory] = useState<MilitaryCategory | "">("");
  const [militaryFile, setMilitaryFile] = useState<File | null>(null);
  const [militaryFileError, setMilitaryFileError] = useState("");

  // One-time discount code — replaces the Military Discount when applied.
  const [appliedCode, setAppliedCode] = useState<AppliedCode | null>(null);
  const [codeError, setCodeError] = useState("");

  // The military discount only reduces THIS booking's price for verified
  // accounts. Riders awaiting verification get a card HOLD for the full fare.
  const discountActive = militaryApproved && !appliedCode;
  const hold = !appliedCode && !militaryApproved && (militaryPending || militaryChecked);
  const breakdown = useMemo(() => {
    if (!appliedCode) return calcPrice(search, { militaryDiscount: discountActive });
    const base = calcPrice(search);
    const discountCents = codeDiscountCents(base.subtotalCents, appliedCode);
    const totalCents = base.subtotalCents - discountCents;
    return { ...base, discountCents, discount: discountCents / 100, totalCents, total: totalCents / 100 };
  }, [search, discountActive, appliedCode]);
  const free = !!appliedCode && breakdown.totalCents === 0;
  const discountLabel = appliedCode
    ? `Discount Code ${appliedCode.code} (${codeLabel(appliedCode)})`
    : `Military Discount (−${MILITARY_DISCOUNT_PERCENT}%)`;
  const codeSmallerThanMilitary = !!appliedCode && militaryApproved &&
    breakdown.discountCents < calcPrice(search, { militaryDiscount: true }).discountCents;
  const discountedIfApproved = useMemo(
    () => calcPrice(search, { militaryDiscount: true }).total,
    [search],
  );

  // Someone ticking the box must pick a category + upload before paying.
  const needsUpload = !appliedCode && !militaryApproved && !militaryPending && militaryChecked;
  const blockedReason = needsUpload && (!militaryCategory || !militaryFile)
    ? "Add your category and upload your ID to submit for the discount — or untick the box to continue at full price."
    : null;

  const [mode, setMode] = useState<"loading" | "simulated" | "real">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paying, setPaying] = useState(false);
  const busy = submitting || paying;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const stripePromise = useMemo<Promise<Stripe | null>>(() => getStripeClient(), []);
  useEffect(() => {
    let cancelled = false;
    stripePromise.then((s) => { if (!cancelled) setMode(s ? "real" : "simulated"); });
    return () => { cancelled = true; };
  }, [stripePromise]);

  // One checkout (and PaymentIntent) per set of booking choices: a declined
  // card retries on the SAME PaymentIntent, so a rider can never be charged
  // twice for one booking. The ID is uploaded at most once per file.
  const intentRef = useRef<{ key: string; intent: PreparedIntent } | null>(null);
  const uploadedRef = useRef<File | null>(null);

  const handleFileChange = (f: File | null) => {
    setMilitaryFileError("");
    if (!f) { setMilitaryFile(null); return; }
    const check = isAllowedIdFile(f.type, f.size);
    if (!check.ok) { setMilitaryFile(null); setMilitaryFileError(check.error ?? "Invalid file."); return; }
    setMilitaryFile(f);
  };

  const prepareIntent: PrepareIntent = async () => {
    setPaymentError("");

    // Not-yet-verified rider opting in: submit the ID for review first, so the
    // server knows to place a hold rather than charge.
    if (needsUpload && militaryFile && militaryCategory && uploadedRef.current !== militaryFile) {
      const fd = new FormData();
      fd.append("file", militaryFile);
      fd.append("category", militaryCategory);
      const nameParts = primary.name.trim().split(/\s+/);
      fd.append("firstName", nameParts[0] ?? "");
      fd.append("lastName", nameParts.slice(1).join(" "));
      fd.append("email", primary.email ?? "");
      fd.append("phone", primary.phone ?? "");
      const upRes = await fetch("/api/military/upload", { method: "POST", body: fd });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        throw new Error(
          `${upData.error ?? "We couldn't upload your ID."} Try again, or untick the military box to continue at full price.`,
        );
      }
      uploadedRef.current = militaryFile;
    }

    const militaryDiscountRequested = !appliedCode && (militaryApproved || militaryPending || militaryChecked);
    const discountCode = appliedCode?.code ?? null;
    const key = JSON.stringify({ militaryDiscountRequested, discountCode, customer: customer?.id ?? null });
    if (intentRef.current?.key === key) return intentRef.current.intent;

    const res = await fetch("/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripId: outbound.id,
        returnTripId: returnSlot?.id ?? null,
        isRoundTrip: search.roundTrip,
        adults: search.adults,
        children: search.children,
        pets: search.pets,
        extraBags: search.extraBags,
        primaryPassenger: primary,
        additionalPassengers,
        specialNotes,
        flights: bookingFlights(search, outbound, returnSlot),
        militaryDiscountRequested,
        discountCode,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.codeError) { setAppliedCode(null); setCodeError(data.error); }
      throw new Error(data.error ?? "Could not start checkout. Please try again.");
    }
    if (!data.free && data.simulated !== (mode === "simulated")) {
      throw new Error("Payments are temporarily unavailable. Please try again shortly or call us to book.");
    }
    intentRef.current = { key, intent: data as PreparedIntent };
    return data as PreparedIntent;
  };

  // After Stripe confirms the payment, create the reservation. If the Stripe
  // webhook is already doing it, poll until it's done.
  const finalize: FinalizeBooking = async (checkoutId, paymentIntentId) => {
    setSubmitting(true);
    setPaymentError("");
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const res = await fetch("/api/booking/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutId, paymentIntentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          intentRef.current = null;
          onNext(data.confirmationNumber, {
            ...(data.military ?? { applied: discountActive, pending: hold }),
            code: appliedCode ? { ...appliedCode, discountCents: breakdown.discountCents } : null,
          });
          return;
        }
        if (res.status === 202 && data.processing) { await sleep(1500); continue; }
        // Sold out / mismatch: the server already released the payment.
        if (res.status === 409 || res.status === 400) { intentRef.current = null; throw new Error(data.error); }
        throw new Error("PAID_NOT_BOOKED");
      }
      throw new Error("PAID_NOT_BOOKED");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setPaymentError(
        msg && msg !== "PAID_NOT_BOOKED"
          ? msg
          : "Your payment went through, but confirming your booking is taking longer than usual. " +
            "Please don't pay again — you'll get a text with your confirmation number shortly. " +
            "If you don't, contact us at support@contactvolt.com.",
      );
      setSubmitting(false);
    }
  };

  const elementsOptions = useMemo<StripeElementsOptions>(() => ({
    mode: "payment",
    amount: breakdown.totalCents,
    currency: "usd",
    captureMethod: hold ? "manual" : "automatic",
    paymentMethodTypes: ["card"],
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#FCC300",
        colorBackground: "#141414",
        colorText: "#ffffff",
        colorDanger: "#f87171",
        borderRadius: "12px",
      },
    },
  }), [breakdown.totalCents, hold]);

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
          disabled={busy}
          className="text-[#A1A1AA] hover:text-white text-sm flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <TripSummary
        search={search} outbound={outbound} returnSlot={returnSlot} primary={primary}
        breakdown={breakdown} hold={hold} discountedIfApproved={discountedIfApproved}
        discountLabel={discountLabel}
      />

      {!appliedCode && <MilitaryDiscountSection
        approved={militaryApproved}
        pending={militaryPending}
        checked={militaryChecked}
        onCheckedChange={setMilitaryChecked}
        category={militaryCategory}
        onCategoryChange={setMilitaryCategory}
        fileName={militaryFile?.name ?? ""}
        fileError={militaryFileError}
        onFileChange={handleFileChange}
      />}

      <DiscountCodeSection
        applied={appliedCode}
        onApplied={(c) => { setAppliedCode(c); setCodeError(""); intentRef.current = null; }}
        onRemove={() => { setAppliedCode(null); intentRef.current = null; }}
        externalError={codeError}
        disabled={submitting}
        smallerThanMilitary={codeSmallerThanMilitary}
      />

      {free && (
        <FreeBookingForm
          prepareIntent={prepareIntent}
          finalize={finalize}
          submitting={submitting}
          paymentError={paymentError}
          onProcessingChange={setPaying}
        />
      )}

      {!free && mode === "loading" && (
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Preparing secure checkout…</p>
        </div>
      )}

      {!free && mode === "simulated" && (
        <SimulatedPaymentForm
          total={breakdown.total}
          hold={hold}
          primary={primary}
          prepareIntent={prepareIntent}
          finalize={finalize}
          submitting={submitting}
          paymentError={paymentError}
          onProcessingChange={setPaying}
          blockedReason={blockedReason}
        />
      )}

      {!free && mode === "real" && (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <StripePaymentForm
            total={breakdown.total}
            hold={hold}
            prepareIntent={prepareIntent}
            finalize={finalize}
            submitting={submitting}
            paymentError={paymentError}
            onProcessingChange={setPaying}
            blockedReason={blockedReason}
          />
        </Elements>
      )}
    </div>
  );
}
