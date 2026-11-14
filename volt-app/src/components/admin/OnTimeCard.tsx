"use client";

// Reports → On-time driving: worked out from drivers' taps on My Trips
// (/api/driver-runs/report). Left on time = within 10 minutes of the planned
// time; at ATL on time = first "Arrived" within 10 minutes of pickup time.

import { useEffect, useState } from "react";
import { Timer, Loader2 } from "lucide-react";

interface Row { name: string; runs: number; leftOnTimePct: number | null; atlOnTimePct: number | null; avgCurbWait: number | null; noShows: number }

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default function OnTimeCard({ days }: { days: number }) {
  const [data, setData] = useState<{ total: Row; drivers: Row[] } | null>(null);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/driver-runs/report?days=${Math.min(90, days)}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        setData(await res.json());
        setError(false);
      } catch { setError(true); }
      setLoadedDays(days);
    })();
  }, [days]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="w-5 h-5 text-[#FCC300]" />
        <h2 className="text-white font-semibold">On-time driving</h2>
      </div>
      <p className="text-[#A1A1AA] text-xs mb-4">
        From drivers&apos; taps on My Trips{days > 90 ? " (last 90 days)" : ""}. On time = within 10 minutes of the planned time.
      </p>
      {loadedDays !== days ? (
        <Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" />
      ) : error || !data ? (
        <p className="text-[#A1A1AA] text-sm">Couldn&apos;t load the on-time report.</p>
      ) : data.total.runs === 0 ? (
        <p className="text-[#A1A1AA] text-sm">No trips run from My Trips in this period yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#A1A1AA] text-xs text-left">
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Trips</th>
                <th className="py-2 pr-3 font-medium">Left on time</th>
                <th className="py-2 pr-3 font-medium">At ATL on time</th>
                <th className="py-2 pr-3 font-medium">Avg curb wait</th>
                <th className="py-2 font-medium">No-shows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[data.total, ...data.drivers].map((r, i) => (
                <tr key={r.name} className={i === 0 ? "text-white font-semibold" : "text-[#D4D4D8]"}>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.runs}</td>
                  <td className="py-2 pr-3">{pct(r.leftOnTimePct)}</td>
                  <td className="py-2 pr-3">{pct(r.atlOnTimePct)}</td>
                  <td className="py-2 pr-3">{r.avgCurbWait === null ? "—" : `${r.avgCurbWait} min`}</td>
                  <td className="py-2">{r.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
