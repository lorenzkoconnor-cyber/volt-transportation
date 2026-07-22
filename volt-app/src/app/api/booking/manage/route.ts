import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";

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
      // Free cancellation until 11:59 PM the day before the trip
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (reservation.trip?.departure_date <= todayStr) {
        return NextResponse.json(
          { error: "Online cancellation closes at 11:59 PM the day before your trip. Please call us to make changes." },
          { status: 400 }
        );
      }

      const seatCount = (reservation.adults ?? 0) + (reservation.children ?? 0);
      const { error: updErr } = await supabase
        .from("reservations")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", reservation.id);
      if (updErr) throw updErr;

      await supabase.rpc("decrement_seats_booked", { p_trip_id: reservation.trip_id, p_count: seatCount });
      if (reservation.return_trip_id) {
        await supabase.rpc("decrement_seats_booked", { p_trip_id: reservation.return_trip_id, p_count: seatCount });
      }

      await supabase.from("audit_logs").insert({
        actor_id: "guest",
        actor_role: "customer",
        action: "reservation.cancelled",
        table_name: "reservations",
        record_id: reservation.id,
        new_data: { via: "manage-reservation" },
      });

      return NextResponse.json({
        success: true,
        reservation: { ...serialize(reservation), status: "cancelled" },
        message: "Your reservation is cancelled. If you paid by card, our team will process your refund within 1–2 business days.",
      });
    }

    // Default: lookup
    return NextResponse.json({ reservation: serialize(reservation) });
  } catch (err) {
    console.error("[booking/manage]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
