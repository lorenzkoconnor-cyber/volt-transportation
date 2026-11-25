// ─── House (door-to-door) stops per trip ──────────────────────────────────────
// A booking's house pickup rides its FIRST leg; its house drop-off rides its
// LAST leg (the return trip on a round trip, else the same trip).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HouseStops { pickups: number; dropoffs: number }

export function houseStopsForTrip(tripId: string, resv: {
  trip_id: string | null; return_trip_id: string | null; is_round_trip?: boolean | null;
  pickup_address: string | null; dropoff_address: string | null;
}): HouseStops {
  const lastLeg = resv.is_round_trip && resv.return_trip_id ? resv.return_trip_id : resv.trip_id;
  return {
    pickups: resv.pickup_address && resv.trip_id === tripId ? 1 : 0,
    dropoffs: resv.dropoff_address && lastLeg === tripId ? 1 : 0,
  };
}

/** House stops on each of these trips, keyed by trip id (trips with none are left out). */
export async function loadHouseStops(sb: any, tripIds: string[]): Promise<Record<string, HouseStops>> {
  const ids = [...new Set(tripIds.filter(Boolean))];
  if (!ids.length) return {};
  const list = ids.join(",");
  const { data } = await sb
    .from("reservations")
    .select("trip_id, return_trip_id, is_round_trip, pickup_address, dropoff_address")
    .or(`trip_id.in.(${list}),return_trip_id.in.(${list})`)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  const out: Record<string, HouseStops> = {};
  for (const r of data ?? []) {
    for (const id of ids) {
      const s = houseStopsForTrip(id, r);
      if (!s.pickups && !s.dropoffs) continue;
      const cur = out[id] ?? { pickups: 0, dropoffs: 0 };
      out[id] = { pickups: cur.pickups + s.pickups, dropoffs: cur.dropoffs + s.dropoffs };
    }
  }
  return out;
}

// ─── Special requests per trip ────────────────────────────────────────────────
// A booking with anything in its notes is flagged on every leg it rides, so a
// request ("pick us up at the Chevron, Exit 19") can't be skipped over.

/** Bookings with notes on each of these trips, keyed by trip id (trips with none are left out). */
export async function loadSpecialRequests(sb: any, tripIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(tripIds.filter(Boolean))];
  if (!ids.length) return {};
  const list = ids.join(",");
  const { data } = await sb
    .from("reservations")
    .select("trip_id, return_trip_id, is_round_trip, special_notes")
    .or(`trip_id.in.(${list}),return_trip_id.in.(${list})`)
    .not("special_notes", "is", null)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!String(r.special_notes ?? "").trim()) continue;
    const legs = new Set([r.trip_id, r.is_round_trip ? r.return_trip_id : null]);
    for (const id of ids) if (legs.has(id)) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}
