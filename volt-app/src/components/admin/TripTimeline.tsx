"use client";

import Link from "next/link";
import { formatTime12h, formatDateLong, formatDateShort } from "@/lib/format";
import { legTimes, atlSpot, minutesBetween, formatDuration, type ClockPoint } from "@/lib/trip-timeline";
import { Plane, Building2, Truck, MapPin, AlertTriangle } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// One leg of a reservation as a step-by-step timeline: when riders show up,
// when the van leaves Volt, when and exactly where it drops off / picks up at
// ATL, and how that lines up with the rider's flight.

interface Step {
  at: ClockPoint;
  icon: "volt" | "van" | "atl" | "plane";
  title: string;
  where?: string;
  note?: string;
  key?: boolean;        // the step staff must hit — drawn in yellow
  warn?: boolean;
}

const ICONS = { volt: Building2, van: Truck, atl: MapPin, plane: Plane } as const;

export function TripLegTimeline({
  label, trip, flight, routeMinutes, arriveEarlyMinutes, voltAddress,
}: {
  label: string;                // "Outbound" / "Return" / "Trip"
  trip: any;                    // trips row with route(origin_key, duration_minutes)
  flight: any | null;           // reservation_flights row for this leg
  routeMinutes: number;         // fallback if the route row has no duration
  arriveEarlyMinutes: number;
  voltAddress: string;
}) {
  const minutes = trip.route?.duration_minutes ?? routeMinutes;
  const t = legTimes(trip.route?.origin_key ?? "columbus", trip.departure_date, trip.departure_time, minutes, arriveEarlyMinutes);
  const spot = atlSpot(flight?.terminal);
  const atlWhere = spot ? `Hartsfield-Jackson · ${spot}` : "Hartsfield-Jackson · terminal not given — confirm with the customer";
  const flightAt: ClockPoint | null = flight ? { date: flight.flight_date, time: flight.flight_time.slice(0, 5) } : null;
  const flightName = flight ? `${flight.airline} ${flight.flight_number}` : "";

  const steps: Step[] = [];
  if (t.kind === "to_atl") {
    if (t.ridersAtVoltBy) {
      steps.push({ at: t.ridersAtVoltBy, icon: "volt", title: "Riders arrive at Volt", note: `${arriveEarlyMinutes} min before departure` });
    }
    steps.push({ at: t.leaveVolt, icon: "van", title: "Van leaves Volt", where: voltAddress, key: true });
    steps.push({ at: t.atAtl, icon: "atl", title: "Drop off at ATL", where: atlWhere, note: `about ${formatDuration(minutes)} drive`, key: true, warn: !spot });
    if (flightAt) {
      const gap = minutesBetween(t.atAtl, flightAt);
      steps.push({
        at: flightAt, icon: "plane", title: `${flightName} departs`,
        note: gap >= 0 ? `${formatDuration(gap)} after drop-off` : `leaves ${formatDuration(gap)} BEFORE drop-off — check this booking`,
        warn: gap < 60,
      });
    }
  } else {
    if (flightAt) {
      const gap = minutesBetween(flightAt, t.atAtl);
      steps.push({
        at: flightAt, icon: "plane", title: `${flightName} lands`, where: spot ?? undefined,
        note: gap >= 0 ? `${formatDuration(gap)} before pickup` : `lands ${formatDuration(gap)} AFTER pickup — check this booking`,
        warn: gap < 0,
      });
    }
    steps.push({
      at: t.leaveVolt, icon: "van", title: "Leave Volt to make the pickup", where: voltAddress,
      note: `latest time to leave · ${formatDuration(minutes)} drive`, key: true,
    });
    steps.push({ at: t.atAtl, icon: "atl", title: "Pick up at ATL", where: atlWhere, key: true, warn: !spot });
    if (t.backAtVolt) steps.push({ at: t.backAtVolt, icon: "volt", title: "Back at Volt" });
  }
  steps.sort((a, b) => minutesBetween(b.at, a.at));

  const headline = t.kind === "to_atl"
    ? `Leave Volt ${formatTime12h(t.leaveVolt.time)} → drop off at ATL ${formatTime12h(t.atAtl.time)}`
    : `Leave Volt ${formatTime12h(t.leaveVolt.time)} → pick up at ATL ${formatTime12h(t.atAtl.time)}`;

  return (
    <div className="bg-white/3 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#FCC300]">
          {label} · {t.kind === "to_atl" ? "Columbus → ATL (drop-off)" : "ATL → Columbus (pickup)"}
        </div>
        <Link href={`/dashboard/manifest?tripId=${trip.id}`} className="text-[#FCC300] hover:text-[#FFD54A] text-xs font-medium">
          Manifest →
        </Link>
      </div>
      <div className="text-white font-semibold">{formatDateLong(t.leaveVolt.date)}</div>
      <div className="text-[#A1A1AA] text-sm mb-4">{headline}</div>

      <ol className="relative">
        {steps.map((s, i) => {
          const Icon = ICONS[s.icon];
          const otherDay = s.at.date !== t.leaveVolt.date;
          return (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/10" aria-hidden />}
              <span className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                s.key ? "bg-[#FCC300] text-[#0A0A0A]" : "bg-white/8 text-[#A1A1AA]"
              }`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`font-semibold tabular-nums ${s.key ? "text-white" : "text-[#D4D4D8]"}`}>
                    {formatTime12h(s.at.time)}
                  </span>
                  {otherDay && <span className="text-xs text-[#FCC300]">{formatDateShort(s.at.date)}</span>}
                  <span className={s.key ? "text-white font-medium" : "text-[#D4D4D8]"}>{s.title}</span>
                </div>
                {s.where && (
                  <div className={`text-sm ${s.warn && s.icon === "atl" ? "text-orange-400" : "text-[#A1A1AA]"}`}>
                    {s.warn && s.icon === "atl" && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                    {s.where}
                  </div>
                )}
                {s.note && (
                  <div className={`text-xs mt-0.5 ${s.warn && s.icon === "plane" ? "text-orange-400" : "text-[#71717A]"}`}>{s.note}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
