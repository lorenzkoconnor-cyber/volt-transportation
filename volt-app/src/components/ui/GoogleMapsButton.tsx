import { MapPin } from "lucide-react";
import { GOOGLE_MAPS_URL } from "@/lib/site-copy";

/**
 * Volt's address as one big button that opens the Google Business Profile —
 * a "Get Directions" box on the left, the address beside it.
 */
export default function GoogleMapsButton({ address, className = "" }: { address: string; className?: string }) {
  return (
    <a
      href={GOOGLE_MAPS_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Get directions to ${address} — open Volt Transportation on Google Maps`}
      className={`group flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-[#E4E4E7] px-4 py-3 text-center text-[#0A0A0A] hover:bg-[#F4F4F5] transition-colors ${className}`}
    >
      <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-[#0A0A0A] bg-white px-4 py-2 text-sm sm:text-base font-bold group-hover:bg-[#FCC300] group-hover:border-[#FCC300] transition-colors">
        Get Directions
        <MapPin className="w-5 h-5 shrink-0 text-[#DC2626]" aria-hidden />
      </span>
      <span className="text-base sm:text-lg font-semibold">{address}</span>
    </a>
  );
}
