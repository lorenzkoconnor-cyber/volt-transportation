"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import StaffBookingForm, { type StaffFormInitial } from "@/components/admin/StaffBookingForm";
import { CUSTOMER_FIELDS, toSavedCustomer, type SavedCustomer } from "@/components/admin/SavedCustomerPicker";
import { createClient } from "@/lib/supabase/client";
import { useAppSettings } from "@/context/SettingsContext";
import { EMPTY_FLIGHT } from "@/lib/booking";
import { localDateString } from "@/lib/format";

const ID_RE = /^[0-9a-f-]{36}$/i;

function blankInitial(saved: SavedCustomer | null, militaryOn: boolean): StaffFormInitial {
  const today = localDateString();
  return {
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
    customer: saved
      ? { firstName: saved.firstName, lastName: saved.lastName, phone: saved.phone, email: saved.email }
      : { firstName: "", lastName: "", phone: "", email: "" },
    additional: [],
    notes: "",
    discount: saved?.militaryVerified && militaryOn ? { kind: "military" } : { kind: "none" },
  };
}

function NewReservationContent() {
  // Customers → "Book new trip" opens /dashboard/reservations/new?customer=<id>.
  const customerId = useSearchParams().get("customer");
  const wanted = customerId && ID_RE.test(customerId) ? customerId : null;
  const settings = useAppSettings();
  const [saved, setSaved] = useState<SavedCustomer | null>(null);
  const [loading, setLoading] = useState(!!wanted);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createClient() as any).from("customers").select(CUSTOMER_FIELDS).eq("id", wanted).maybeSingle()
      .then(({ data }: { data: unknown }) => { if (live) { setSaved(data ? toSavedCustomer(data) : null); setLoading(false); } });
    return () => { live = false; };
  }, [wanted]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href={wanted ? "/dashboard/customers" : "/dashboard/reservations"}>
          <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Reservation</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {saved
              ? `New trip for ${`${saved.firstName} ${saved.lastName}`.trim()} — their details are filled in`
              : "Book a passenger over the phone or at the counter"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#A1A1AA] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading customer…</div>
      ) : (
        <StaffBookingForm
          key={saved?.id ?? "blank"}
          mode="new"
          skipDraft={!!saved}
          initial={blankInitial(saved, settings.military.enabled)}
        />
      )}
    </div>
  );
}

export default function NewReservationPage() {
  return (
    <Suspense fallback={<div className="text-[#A1A1AA] p-8">Loading…</div>}>
      <NewReservationContent />
    </Suspense>
  );
}
