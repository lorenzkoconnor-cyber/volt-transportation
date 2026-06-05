import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createClient(): Promise<any> {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// GET /api/trips/availability?route_key=columbus-atl&date=2026-07-10
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const routeKey = searchParams.get("route_key");   // "columbus-atl" or "atl-columbus"
  const date = searchParams.get("date");             // "2026-07-10"

  if (!routeKey || !date) {
    return NextResponse.json({ error: "route_key and date are required" }, { status: 400 });
  }

  // Parse the route key into origin/destination
  const [originKey, destinationKey] = routeKey.split("-");

  try {
    const supabase = await createClient();

    // Find the route
    const { data: route, error: routeError } = await supabase
      .from("routes")
      .select("id")
      .eq("origin_key", originKey)
      .eq("destination_key", destinationKey)
      .eq("is_active", true)
      .single();

    if (routeError || !route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Get all trips for this route and date with availability
    const { data: trips, error: tripsError } = await supabase
      .from("trips")
      .select("id, departure_time, total_capacity, seats_booked, status")
      .eq("route_id", route.id)
      .eq("departure_date", date)
      .eq("status", "scheduled")
      .order("departure_time");

    if (tripsError) throw tripsError;

    // Format response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slots = (trips || []).map((trip: any) => {
      const [hourStr] = trip.departure_time.split(":");
      const hour = parseInt(hourStr, 10);
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour < 12 ? "AM" : "PM";
      const seatsLeft = trip.total_capacity - trip.seats_booked;

      return {
        id: trip.id,
        time: trip.departure_time,
        displayTime: `${h12}:00 ${ampm}`,
        available: seatsLeft > 0,
        seatsLeft,
        totalSeats: trip.total_capacity,
      };
    });

    return NextResponse.json({ slots });
  } catch (err) {
    console.error("[trips/availability]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
