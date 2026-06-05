import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, Calendar, Clock, MapPin, Users, MessageSquare, Download } from "lucide-react";
import {
  type BookingSearch,
  type Passenger,
  type DepartureSlot,
  calcPrice,
  formatDate,
  LOCATIONS,
} from "@/lib/booking";

interface Props {
  confirmationNumber: string;
  search: BookingSearch;
  outbound: DepartureSlot;
  returnSlot: DepartureSlot | null;
  primary: Passenger;
}

export default function Step5Confirmation({
  confirmationNumber,
  search,
  outbound,
  returnSlot,
  primary,
}: Props) {
  const { total } = calcPrice(search);

  return (
    <div className="space-y-6 text-center">
      {/* Success header */}
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-[#7C3AED]/15 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-[#7C3AED]" />
          </div>
          <div className="absolute inset-0 rounded-full bg-[#7C3AED]/10 animate-ping" />
        </div>
        <div>
          <h2 className="text-white text-2xl font-bold mb-1">You&apos;re booked!</h2>
          <p className="text-[#A1A1AA]">
            A confirmation has been sent to {primary.email} and via SMS to {primary.phone}.
          </p>
        </div>
      </div>

      {/* Confirmation number */}
      <div className="glass rounded-2xl p-6 border border-[#7C3AED]/30">
        <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2">Confirmation Number</p>
        <p className="text-white text-3xl font-bold tracking-wider">{confirmationNumber}</p>
        <p className="text-[#A1A1AA] text-xs mt-2">Save this number to manage your reservation</p>
      </div>

      {/* Booking summary */}
      <div className="glass rounded-2xl p-6 text-left space-y-4">
        <h3 className="text-white font-semibold">Booking Summary</h3>
        <div className="space-y-3">
          {[
            {
              icon: MapPin,
              label: "Route",
              value: `${LOCATIONS[search.from].label} → ${LOCATIONS[search.to].label}`,
            },
            { icon: Calendar, label: "Date", value: formatDate(search.date) },
            { icon: Clock, label: "Departure", value: outbound.displayTime },
            ...(returnSlot ? [{ icon: Clock, label: "Return", value: returnSlot.displayTime }] : []),
            {
              icon: Users,
              label: "Passengers",
              value: `${search.adults} adult${search.adults > 1 ? "s" : ""}${search.children > 0 ? ` · ${search.children} child${search.children > 1 ? "ren" : ""}` : ""}`,
            },
            { icon: MessageSquare, label: "Contact", value: primary.phone },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#7C3AED]" />
                </div>
                <div>
                  <div className="text-[#A1A1AA] text-xs">{item.label}</div>
                  <div className="text-white text-sm font-medium">{item.value}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[#A1A1AA] text-sm">Total Paid</span>
          <span className="text-white font-bold text-lg">${total}</span>
        </div>
      </div>

      {/* What happens next */}
      <div className="glass rounded-2xl p-5 text-left">
        <h3 className="text-white font-semibold mb-3">What&apos;s Next</h3>
        <ul className="space-y-2">
          {[
            "You'll receive an SMS confirmation shortly with pickup details",
            "Arrive at your pickup location 10 minutes before departure",
            "Your driver will assist with luggage",
            "A reminder SMS will be sent the day before your trip",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-[#A1A1AA]">
              <span className="w-5 h-5 rounded-full bg-[#7C3AED]/20 flex items-center justify-center text-[#7C3AED] text-xs flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/manage-reservation">
          <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/5">
            Manage Reservation
          </Button>
        </Link>
        <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/5">
          <Download className="w-4 h-4 mr-2" />
          Download Receipt
        </Button>
      </div>

      <Link href="/">
        <Button className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-12 rounded-xl">
          Back to Home
        </Button>
      </Link>
    </div>
  );
}
