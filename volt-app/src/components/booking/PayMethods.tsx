"use client";

// The Card | Apple Pay | Google Pay tabs shared by checkout (Step4Checkout)
// and the short pay pages (QuickCardPay: tip after the trip, ride-along).

import { CreditCard } from "lucide-react";

export type PayMethod = "card" | "applePay" | "googlePay";

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.37 12.63c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.4-3.69zM14.1 5.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.6-2.66 1.37-.58.67-1.09 1.75-.95 2.78 1.01.08 2.04-.51 2.67-1.27z" />
    </svg>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.95 14.55 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.64-3.65 8.64-8.8 0-.6-.07-1.05-.15-1.5z" />
    </svg>
  );
}

export const PAY_METHODS: { id: PayMethod; label: string; Icon: (p: { className?: string }) => React.ReactNode }[] = [
  { id: "card", label: "Card", Icon: CreditCard },
  { id: "applePay", label: "Apple Pay", Icon: AppleLogo },
  { id: "googlePay", label: "Google Pay", Icon: GoogleLogo },
];

