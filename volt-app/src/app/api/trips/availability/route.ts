import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, SUPABASE_ANON_KEY } from "@/lib/supabase/url";
import { DEFAULT_FLIGHT_TIMING, arrivalFor, displayTime12h, type FlightTimingSettings } from "@/lib/booking";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createClient(): Promise<any> {
  return createSupabaseClient(
    getSupabaseUrl(),
    SUPABASE_ANON_KEY
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
      .select("id, duration_minutes")
      .eq("origin_key", originKey)
      .eq("destination_key", destinationKey)
      .eq("is_active", true)
      .single();

    if (routeError || !route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Get all trips for this route and date with availability, plus the
    // flight-fit settings the booking flow uses to match departures to flights.
    const [{ data: trips, error: tripsError }, { data: settings }] = await Promise.all([
      supabase
        .from("trips")
        .select("id, departure_time, total_capacity, seats_booked, status")
        .eq("route_id", route.id)
        .eq("departure_date", date)
        .eq("status", "scheduled")
        .order("departure_time"),
      supabase.from("booking_settings").select("*").maybeSingle(),
    ]);

    if (tripsError) throw tripsError;

    const routeMinutes = route.duration_minutes ?? DEFAULT_FLIGHT_TIMING.routeMinutes;

    // Format response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slots = (trips || []).map((trip: any) => {
      const seatsLeft = trip.total_capacity - trip.seats_booked;

      return {
        id: trip.id,
        date,
        time: trip.departure_time.slice(0, 5),
        displayTime: displayTime12h(trip.departure_time),
        ...arrivalFor(date, trip.departure_time.slice(0, 5), routeMinutes),
        available: seatsLeft > 0,
        seatsLeft,
        totalSeats: trip.total_capacity,
      };
    });

    const timing: FlightTimingSettings = {
      routeMinutes,
      departMinBufferMinutes: settings?.depart_min_buffer_minutes ?? DEFAULT_FLIGHT_TIMING.departMinBufferMinutes,
      departMaxBufferMinutes: settings?.depart_max_buffer_minutes ?? DEFAULT_FLIGHT_TIMING.departMaxBufferMinutes,
      arriveMinWaitMinutes: settings?.arrive_min_wait_minutes ?? DEFAULT_FLIGHT_TIMING.arriveMinWaitMinutes,
      arriveMaxWaitMinutes: settings?.arrive_max_wait_minutes ?? DEFAULT_FLIGHT_TIMING.arriveMaxWaitMinutes,
    };

    return NextResponse.json({ slots, timing });
  } catch (err) {
    console.error("[trips/availability]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
