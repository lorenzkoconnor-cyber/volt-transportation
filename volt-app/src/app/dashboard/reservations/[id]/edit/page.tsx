"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Lock } from "lucide-react";
import StaffBookingForm, { type StaffFormInitial } from "@/components/admin/StaffBookingForm";
import {
  type BookingSearch, type DepartureSlot, type FlightInfo, type LocationKey,
  EMPTY_FLIGHT, arrivalFor, displayTime12h,
} from "@/lib/booking";
import type { StaffDiscount } from "@/lib/staff-pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */

// The reservation's current trip as a departure slot the form can show/keep.
function slotFor(t: any, held: number): DepartureSlot {
  const time = t.departure_time.slice(0, 5);
  const seatsLeft = t.total_capacity - t.seats_booked + held;
  return {
    id: t.id,
    date: t.departure_date,
    time,
    displayTime: displayTime12h(time),
    ...arrivalFor(t.departure_date, time, t.route?.duration_minutes ?? 120),
    available: seatsLeft > 0,
    seatsLeft,
    totalSeats: t.total_capacity,
  };
}

function flightFor(f: any): FlightInfo {
  return f
    ? { airline: f.airline, flightNumber: f.flight_number, terminal: f.terminal, date: f.flight_date, time: f.flight_time.slice(0, 5) }
    : { ...EMPTY_FLIGHT };
}

function toInitial(r: any): { initial: StaffFormInitial; held: Record<string, number> } {
  const seats = (r.adults ?? 0) + (r.children ?? 0);
  const held: Record<string, number> = {};
  if (r.trip_id) held[r.trip_id] = seats;
  if (r.is_round_trip && r.return_trip_id) held[r.return_trip_id] = (held[r.return_trip_id] ?? 0) + seats;

  const outbound = slotFor(r.trip, held[r.trip.id] ?? 0);
  const returnSlot = r.is_round_trip && r.return_trip ? slotFor(r.return_trip, held[r.return_trip.id] ?? 0) : null;
  const from = (r.trip.route?.origin_key ?? "columbus") as LocationKey;
  const to = (r.trip.route?.destination_key ?? "atl") as LocationKey;
  const flights = r.reservation_flights ?? [];
  const outFlight = flights.find((f: any) => f.leg === "outbound");
  const retFlight = flights.find((f: any) => f.leg === "return");

  // Without a flight, the airport-time picker searches by the ATL-side date:
  // arrival date heading to ATL, departure date heading home.
  const airportDate = (slot: DepartureSlot, dest: LocationKey) =>
    dest === "atl" ? slot.arrivalDate ?? slot.date! : slot.date!;

  const search: BookingSearch = {
    from,
    to,
    date: outFlight ? outFlight.flight_date : airportDate(outbound, to),
    returnDate: returnSlot ? (retFlight ? retFlight.flight_date : airportDate(returnSlot, from)) : "",
    adults: r.adults,
    children: r.children,
    pets: r.pets,
    extraBags: r.extra_bags,
    roundTrip: !!returnSlot,
    hasFlight: !!outFlight,
    outboundFlight: flightFor(outFlight),
    returnFlight: flightFor(retFlight),
  };

  const discount: StaffDiscount =
    r.discount_code ? { kind: "code", code: r.discount_code.code, type: r.discount_code.discount_type, value: r.discount_code.value }
    : r.is_military ? { kind: "military" }
    : r.discount_cents > 0 && r.total_cents === 0 ? { kind: "manual", type: "percent", value: 100 }
    : r.discount_cents > 0 ? { kind: "manual", type: "amount", value: r.discount_cents / 100 }
    : { kind: "none" };

  const email: string = r.customer?.email ?? "";
  const passengers = r.reservation_passengers ?? [];
  return {
    held,
    initial: {
      search,
      outbound,
      returnSlot,
      customer: {
        firstName: r.customer?.first_name ?? "",
        lastName: r.customer?.last_name ?? "",
        phone: r.customer?.phone ?? "",
        email: email.endsWith("@walkin.volt") || email.endsWith("@guest.volt") ? "" : email,
      },
      additional: passengers.filter((p: any) => !p.is_primary).map((p: any) => p.name),
      notes: r.special_notes ?? "",
      discount,
    },
  };
}

export default function EditReservationPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "locked"; message: string; confirmation: string }
    | { status: "ready"; reservation: any; initial: StaffFormInitial; held: Record<string, number>; returnOnly: boolean }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reservations/${id}/edit`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setState({ status: "error", message: data.error ?? "Could not load the reservation." });
        else if (!data.mode) setState({ status: "locked", message: data.lockReason, confirmation: data.reservation.confirmation_number });
        else setState({ status: "ready", reservation: data.reservation, returnOnly: data.mode === "return_only", ...toInitial(data.reservation) });
      })
      .catch(() => { if (!cancelled) setState({ status: "error", message: "Could not load the reservation." }); });
    return () => { cancelled = true; };
  }, [id]);

  const header = (subtitle: string) => (
    <div className="flex items-center gap-4">
      <Link href={`/dashboard/reservations/${id}`}>
        <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Edit Reservation</h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">{subtitle}</p>
      </div>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" />
      </div>
    );
  }
  if (state.status === "error" || state.status === "locked") {
    return (
      <div className="space-y-6 max-w-3xl">
        {header(state.status === "locked" ? state.confirmation : "")}
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          {state.status === "locked" ? <Lock className="w-8 h-8 text-[#FCC300]" /> : <AlertCircle className="w-8 h-8 text-red-400" />}
          <p className="text-white font-medium">{state.message}</p>
          <Link href={`/dashboard/reservations/${id}`} className="text-[#FCC300] hover:underline text-sm">← Back to the reservation</Link>
        </div>
      </div>
    );
  }

  const { reservation: r, initial, held, returnOnly } = state;
  return (
    <div className="space-y-6 max-w-3xl">
      {header(`${r.confirmation_number} · changes are texted to the customer`)}
      <StaffBookingForm
        mode="edit"
        reservationId={r.id}
        oldTotalCents={r.total_cents}
        heldSeats={held}
        returnOnly={returnOnly}
        initial={initial}
      />
    </div>
  );
}
