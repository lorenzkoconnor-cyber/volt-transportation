import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { rateLimit } from "@/lib/rate-limit";
import { easternToday } from "@/lib/format";
import { cancelReservation, cancellationFeeCents } from "@/lib/cancellation";
import { loadAppSettings } from "@/lib/settings-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminClient(): any {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const digits = (s: string) => (s ?? "").replace(/\D/g, "");

// Look up a reservation by confirmation number + booking phone (guest access).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findReservation(supabase: any, confirmationNumber: string, phone: string) {
  const { data } = await supabase
    .from("reservations")
    .select(
      "id, confirmation_number, status, adults, children, pets, extra_bags, total_cents, trip_id, return_trip_id, " +
      "customer:customers(phone), " +
      "trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(origin_label, destination_label))"
    )
    .eq("confirmation_number", confirmationNumber.trim().toUpperCase())
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  const bookedPhone = digits(data.customer?.phone);
  const givenPhone = digits(phone);
  // Compare the last 10 digits so "+1 (706)..." matches "706..."
  if (!bookedPhone || !givenPhone || bookedPhone.slice(-10) !== givenPhone.slice(-10)) return null;
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    confirmationNumber: r.confirmation_number,
    status: r.status,
    from: r.trip?.route?.origin_label ?? "—",
    to: r.trip?.route?.destination_label ?? "—",
    date: r.trip?.departure_date ?? "",
    time: r.trip?.departure_time ?? "",
    passengers: (r.adults ?? 0) + (r.children ?? 0),
    totalCents: r.total_cents,
  };
}

// POST /api/booking/manage  { action: "lookup" | "cancel", confirmationNumber, phone }
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "booking-manage", 10, 15 * 60_000);
  if (limited) return limited;

  try {
    const { action, confirmationNumber, phone } = await request.json();
    if (!confirmationNumber || !phone) {
      return NextResponse.json({ error: "Confirmation number and phone are required" }, { status: 400 });
    }

    const supabase = adminClient();
    const reservation = await findReservation(supabase, confirmationNumber, phone);
    if (!reservation) {
      return NextResponse.json(
        { error: "No reservation found. Check your confirmation number and the phone number used at booking." },
        { status: 404 }
      );
    }

    if (action === "cancel") {
      if (reservation.status === "cancelled") {
        return NextResponse.json({ error: "This reservation is already cancelled." }, { status: 400 });
      }
      if (reservation.status === "completed" || reservation.status === "no_show") {
        return NextResponse.json({ error: "This trip has already happened." }, { status: 400 });
      }
      // Online cancellation closes at 11:59 PM Eastern the day before the trip.
      if (!reservation.trip?.departure_date || reservation.trip.departure_date <= easternToday()) {
        return NextResponse.json(
          { error: `Online cancellation closes at 11:59 PM (Eastern) the day before your trip. Please call us at ${(await loadAppSettings()).business.phone}.` },
          { status: 400 }
        );
      }

      const result = await cancelReservation(supabase, reservation.id, { kind: "customer" });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });

      return NextResponse.json({
        success: true,
        reservation: { ...serialize(reservation), status: "cancelled" },
        message: `Your reservation is cancelled. ${result.customerLine}`,
      });
    }

    // Default: lookup
    return NextResponse.json({
      reservation: serialize(reservation),
      cancellationFeeCents: await cancellationFeeCents(),
      canCancelOnline: !!reservation.trip?.departure_date && reservation.trip.departure_date > easternToday(),
    });
  } catch (err) {
    console.error("[booking/manage]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
