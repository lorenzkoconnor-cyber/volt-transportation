// A pretend ATL pickup for new drivers to tap through. Nothing is saved or sent.
import type { RunPayload } from "@/lib/driver-runs-server";

export function practiceRun(now: number): RunPayload {
  const dep = new Date(now + 120 * 60_000).toISOString();
  const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  return {
    tripVehicleId: "practice",
    trip: {
      id: "practice", date: dep.slice(0, 10), time: new Date(dep).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" }),
      kind: "from_atl", routeName: "ATL Airport → Columbus (practice)", routeMinutes: 120, departureAt: dep,
      status: "scheduled", isPrivate: false,
    },
    vehicle: { id: "practice-van", name: "Van 2", plate: "PRACTICE", capacity: 8 },
    driver: { id: "practice-driver", name: "You", firstName: "You", photoUrl: null },
    riders: [
      {
        reservationId: "p1", name: "Sam Smith", partySize: 2, terminal: "Domestic – South", bookedTerminal: "Domestic – South",
        flight: "DL 1234 · lands 8:05 PM", boarded: false, noShow: false, notes: "", doorAddress: null, rideAlong: false,
        update: { status: "outside", delayMinutes: null, newLandingTime: null, terminal: null, updatedAt: minsAgo(1) }, canText: true, messages: [],
      },
      {
        reservationId: "p2", name: "Jordan Jones", partySize: 1, terminal: "Domestic – South", bookedTerminal: "Domestic – South",
        flight: "WN 880 · lands 8:15 PM", boarded: false, noShow: false, notes: "Two large suitcases", doorAddress: null, rideAlong: false,
        update: { status: "baggage", delayMinutes: 10, newLandingTime: null, terminal: null, updatedAt: minsAgo(2) }, canText: true,
        messages: [{ id: "pm-j1", from: "rider", body: "Grabbing my bags at carousel 7, then out door S3. I'm in a red jacket.", at: minsAgo(1) }],
      },
      {
        reservationId: "p3", name: "Priya Patel", partySize: 2, terminal: "Domestic – North", bookedTerminal: "Domestic – North",
        flight: "AA 2201 · lands 8:40 PM", boarded: false, noShow: false, notes: "", doorAddress: null, rideAlong: false,
        update: { status: "delayed", delayMinutes: null, newLandingTime: "20:55", terminal: null, updatedAt: minsAgo(5) }, canText: false, messages: [],
      },
    ],
    events: [],
    checkedToday: false,
  };
}
