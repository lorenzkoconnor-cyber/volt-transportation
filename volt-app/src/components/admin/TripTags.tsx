import { Home, MessageSquare, PlaneLanding } from "lucide-react";
import { staffTripTime } from "@/lib/trip-timeline";

/* eslint-disable @typescript-eslint/no-explicit-any */

// A trip's time as staff should read it: "Leave Volt 6:00 AM", or for an
// airport pickup "ATL pickup 6:00 PM · leave Volt by 4:00 PM".
export function TripTime({ trip, className = "", subClassName = "", stacked = false }: {
  trip: any;           // trips row with departure_date, departure_time, route(origin_key, duration_minutes)
  className?: string;
  subClassName?: string;
  stacked?: boolean;   // put "leave Volt by…" on its own line
}) {
  const t = staffTripTime(trip?.route?.origin_key, trip?.departure_date ?? "", trip?.departure_time ?? "", trip?.route?.duration_minutes);
  return (
    <span className={`${stacked ? "inline-flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-1.5"} ${className}`}>
      <span className={t.atlPickup ? "inline-flex items-center gap-1" : ""}>
        {t.atlPickup && <PlaneLanding className="w-3.5 h-3.5 text-sky-300 flex-shrink-0" />}
        {t.main}
      </span>
      {t.sub && <span className={`text-[#A1A1AA] font-normal text-xs ${subClassName}`}>{stacked ? t.sub : `· ${t.sub}`}</span>}
    </span>
  );
}

// Door-to-door service flag for lists, so a house pickup can't be missed.
export function HouseTag({ pickup, dropoff, count, solid = false, className = "" }: {
  pickup?: boolean;
  dropoff?: boolean;
  count?: number;      // trip-level: how many house stops on this van
  solid?: boolean;     // filled orange, for use on coloured cards
  className?: string;
}) {
  if (!pickup && !dropoff && !count) return null;
  const label = count
    ? `${count} house stop${count === 1 ? "" : "s"}`
    : pickup && dropoff ? "House pickup + drop-off" : pickup ? "House pickup" : "House drop-off";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
      solid ? "bg-orange-500 border-orange-300 text-white" : "bg-orange-500/15 border-orange-400/40 text-orange-300"
    } ${className}`}>
      <Home className="w-3 h-3" />{label}
    </span>
  );
}

// A booking on this van has notes — yellow, so a special request can't be missed.
export function SpecialRequestTag({ count = 1, solid = false, className = "" }: {
  count?: number;      // how many bookings on this van have notes
  solid?: boolean;     // filled yellow, for use on coloured cards
  className?: string;
}) {
  if (!count) return null;
  return (
    <span className={`inline-flex max-w-full items-center gap-2.5 rounded-xl border px-1.5 py-1 text-[11px] font-semibold leading-[1.15] ${
      solid ? "bg-[#FCC300] border-yellow-200 text-black" : "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]"
    } ${className}`}>
      <MessageSquare className="w-3 h-3 flex-shrink-0" />
      <span>{count > 1 ? `${count} Special Requests` : "Special Request"}</span>
    </span>
  );
}
