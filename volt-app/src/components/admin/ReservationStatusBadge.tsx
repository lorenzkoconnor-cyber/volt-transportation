"use client";

// Reservation status badge for the staff dashboard. When onComplete is given,
// double-clicking a "Booked" badge marks the reservation completed (once the
// day of its last ride has arrived). A single click does nothing, so a stray
// tap — or a click on a row link — never changes anything.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { STATUS_STYLES, canQuickComplete, statusLabel } from "@/lib/reservation-status";

interface Props {
  status: string;
  lastRideDate?: string | null;
  onComplete?: () => Promise<void> | void;
  className?: string;
}

export default function ReservationStatusBadge({ status, lastRideDate, onComplete, className = "" }: Props) {
  const [busy, setBusy] = useState(false);
  const base = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? ""} ${className}`;

  if (!onComplete || status !== "confirmed") {
    return <span className={base}>{statusLabel(status)}</span>;
  }

  const ready = canQuickComplete(status, lastRideDate);
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={stop}
      onDoubleClick={async (e) => {
        stop(e);
        if (!ready || busy) return;
        setBusy(true);
        try { await onComplete(); } finally { setBusy(false); }
      }}
      title={ready ? "Double-click to mark completed" : "Can be marked completed on the day of the last ride"}
      className={`${base} select-none ${ready ? "cursor-pointer hover:ring-1 hover:ring-[#FCC300]/60" : "cursor-default"}`}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {statusLabel(status)}
    </button>
  );
}
