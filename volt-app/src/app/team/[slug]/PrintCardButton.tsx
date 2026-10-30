"use client";

import { Printer } from "lucide-react";

// Prints the page's hidden sheet of business cards (see .print-sheet in globals.css).
export default function PrintCardButton() {
  return (
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-4 inline-flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-white transition-colors"
      >
        <Printer className="w-4 h-4" /> Print business cards
      </button>
      <p className="text-[#A1A1AA]/70 text-xs mt-1">
        10 per Letter sheet (Avery 8371). Print at 100% / Actual size.
      </p>
    </>
  );
}
