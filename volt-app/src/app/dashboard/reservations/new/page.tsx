"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import StaffBookingForm from "@/components/admin/StaffBookingForm";
import { EMPTY_FLIGHT } from "@/lib/booking";
import { localDateString } from "@/lib/format";

export default function NewReservationPage() {
  const today = localDateString();
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/reservations">
          <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Reservation</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">Book a passenger over the phone or at the counter</p>
        </div>
      </div>

      <StaffBookingForm
        mode="new"
        initial={{
          search: {
            from: "columbus",
            to: "atl",
            date: today,
            returnDate: "",
            adults: 1,
            children: 0,
            pets: 0,
            extraBags: 0,
            roundTrip: false,
            hasFlight: false,
            outboundFlight: { ...EMPTY_FLIGHT, date: today },
            returnFlight: { ...EMPTY_FLIGHT },
          },
          outbound: null,
          returnSlot: null,
          customer: { firstName: "", lastName: "", phone: "", email: "" },
          additional: [],
          notes: "",
          discount: { kind: "none" },
        }}
      />
    </div>
  );
}
