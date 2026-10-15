"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

// Print button (and auto-print when staff open the receipt with ?print=1).
export default function ReceiptActions({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="no-print mx-auto max-w-[640px] flex justify-end mb-3">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold text-sm px-4 h-10 transition-colors"
      >
        <Printer className="w-4 h-4" /> Print receipt
      </button>
    </div>
  );
}
