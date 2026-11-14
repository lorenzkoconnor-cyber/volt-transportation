"use client";

// ─── Van progress bar ─────────────────────────────────────────────────────────
// One smooth line from Columbus to ATL. While the van is on the highway the
// marker is recalculated every second and slides with a linear animation, so
// it moves steadily toward where the van is headed (no steps or midpoints).
// Used on the driver screen, the rider tracking page and the Dispatch board.

import { useEffect, useState } from "react";
import { livePosition, windowLabel, type Position } from "@/lib/driver-run";

export default function VanProgressBar({ position, compact = false, showEta = true, clockOffset = 0 }: {
  position: Position; compact?: boolean; showEta?: boolean;
  clockOffset?: number; // practice trips run on a shifted clock
}) {
  const [tick, setNow] = useState(() => Date.now());
  const now = tick + clockOffset;
  useEffect(() => {
    if (!position.motion) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [position.motion]);

  const live = livePosition(position, now);
  const pct = Math.min(100, Math.max(0, live.fromColumbus * 100));
  const towardAtl = position.motion ? position.motion.towardAtl : position.towardAtl;

  return (
    <div>
      {!compact && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-white font-semibold">{position.headline}</span>
          {showEta && position.eta && (
            <span className="text-[#A1A1AA] text-xs">{position.eta.label} ~{windowLabel(position.eta.from, position.eta.to)}</span>
          )}
        </div>
      )}
      <div className={`relative rounded-full bg-white/10 ${compact ? "h-1.5 mt-2" : "h-2 mt-3"}`}>
        <div className="absolute inset-y-0 rounded-full bg-[#FCC300]/50"
          style={towardAtl
            ? { left: 0, width: `${pct}%`, transition: "width 1s linear" }
            : { left: `${pct}%`, right: 0, transition: "left 1s linear" }} />
        <div className={`absolute rounded-full bg-[#FCC300] border-2 border-black ${compact ? "-top-[5px] w-4 h-4" : "-top-1 w-4 h-4"}`}
          style={{ left: `calc(${pct}% - 8px)`, transition: "left 1s linear" }} />
      </div>
      <div className="flex justify-between text-[11px] text-[#71717A] mt-1.5">
        <span>Columbus</span><span>ATL</span>
      </div>
      {!compact && (
        <p className="text-[#A1A1AA] text-xs mt-1">{live.label}{position.estimated ? " (estimate)" : ""}</p>
      )}
    </div>
  );
}
