// ─── Volt Transportation Booking Logic ────────────────────────────────────────

export const PRICING = {
  adult: 59,
  child: 49,
  pet: 25,
  extraBag: 10,
} as const;

// Military & First Responder discount — 5% off the whole booking, applied only
// for verified accounts (see src/lib/military.ts and /api/military/*).
export const MILITARY_DISCOUNT_RATE = 0.05;

// Format a dollar amount that may be fractional (e.g. after a % discount):
// "59" stays "59", but "56.05" keeps its cents.
export function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export const LOCATIONS = {
  columbus: { label: "Columbus, GA", short: "Columbus" },
  atl: { label: "ATL Airport", short: "ATL" },
} as const;

export type LocationKey = keyof typeof LOCATIONS;

export interface BookingSearch {
  from: LocationKey;
  to: LocationKey;
  date: string;
  returnDate: string;   // only used when roundTrip is true
  adults: number;
  children: number;
  pets: number;
  extraBags: number;
  roundTrip: boolean;
  // Flight mode: when on, flight dates drive `date` / `returnDate` and step 2
  // only offers departures that fit the flight(s).
  hasFlight: boolean;
  outboundFlight: FlightInfo;
  returnFlight: FlightInfo;   // only used when roundTrip is true
}

export interface FlightInfo {
  airline: string;
  flightNumber: string;
  terminal: string;
  date: string;   // "2026-10-02"
  time: string;   // "10:30" — departure time if flying out of ATL, arrival time if flying in
}

export const EMPTY_FLIGHT: FlightInfo = { airline: "", flightNumber: "", terminal: "", date: "", time: "" };

// A leg that ends at ATL is for a departing flight; one that starts at ATL
// meets an arriving flight.
export type FlightDirection = "departing" | "arriving";
export function flightDirection(from: LocationKey): FlightDirection {
  return from === "atl" ? "arriving" : "departing";
}

export const ATL_TERMINALS = [
  "Domestic – South",
  "Domestic – North",
  "International (Concourse F)",
] as const;

// Airlines serving ATL, with the terminal they normally use (pre-fills the
// terminal field; the rider can still change it, e.g. for international flights).
export const ATL_AIRLINES: { name: string; terminal: (typeof ATL_TERMINALS)[number] }[] = [
  { name: "Delta", terminal: "Domestic – South" },
  { name: "Southwest", terminal: "Domestic – North" },
  { name: "American", terminal: "Domestic – North" },
  { name: "United", terminal: "Domestic – North" },
  { name: "Spirit", terminal: "Domestic – North" },
  { name: "Frontier", terminal: "Domestic – North" },
  { name: "JetBlue", terminal: "Domestic – North" },
  { name: "Alaska", terminal: "Domestic – North" },
  { name: "Air Canada", terminal: "International (Concourse F)" },
  { name: "Air France", terminal: "International (Concourse F)" },
  { name: "British Airways", terminal: "International (Concourse F)" },
  { name: "KLM", terminal: "International (Concourse F)" },
  { name: "Korean Air", terminal: "International (Concourse F)" },
  { name: "Lufthansa", terminal: "International (Concourse F)" },
  { name: "Qatar Airways", terminal: "International (Concourse F)" },
  { name: "Turkish Airlines", terminal: "International (Concourse F)" },
  { name: "Virgin Atlantic", terminal: "International (Concourse F)" },
];

// Owner/manager-adjustable timing (routes.duration_minutes + booking_settings).
// These defaults are only used if the settings can't be loaded.
export interface FlightTimingSettings {
  routeMinutes: number;            // scheduled Volt route time for this leg
  departMinBufferMinutes: number;  // earliest-acceptable: reach ATL ≥ this long before a flight
  departMaxBufferMinutes: number;  // don't offer shuttles reaching ATL earlier than this
  arriveMinWaitMinutes: number;    // leave ATL ≥ this long after landing
  arriveMaxWaitMinutes: number;    // don't offer shuttles leaving later than this
}

export const DEFAULT_FLIGHT_TIMING: FlightTimingSettings = {
  routeMinutes: 105,
  departMinBufferMinutes: 60,
  departMaxBufferMinutes: 240,
  arriveMinWaitMinutes: 30,
  arriveMaxWaitMinutes: 180,
};

export interface DepartureSlot {
  id: string;
  date?: string;        // "2026-10-02" — the Volt departure date (may differ from the flight date)
  time: string;         // "08:00"
  displayTime: string;  // "8:00 AM"
  // Estimated arrival at the destination, using the route time.
  arrivalDate?: string;
  arrivalTime?: string;
  arrivalDisplayTime?: string;
  available: boolean;
  seatsLeft: number;
  totalSeats: number;
}

export interface Passenger {
  name: string;
  phone: string;
  email: string;
}

export interface BookingState {
  search: BookingSearch;
  outboundDeparture: DepartureSlot | null;
  returnDeparture: DepartureSlot | null;
  primaryPassenger: Passenger;
  additionalPassengers: string[];
  specialRequests: string;
}

export interface PriceBreakdown {
  adultTotal: number;
  childTotal: number;
  petTotal: number;
  extraBagTotal: number;
  oneWaySubtotal: number;
  subtotal: number;          // pre-discount total (both legs), whole dollars
  discount: number;          // dollars off (may be fractional)
  total: number;             // amount due after discount (may be fractional)
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  militaryDiscount: boolean; // whether the 5% was applied to these numbers
  lines: { label: string; amount: number }[];
}

// Generate all 24 hourly departure slots for a given day
export function generateDepartureSlots(date: string, from: LocationKey): DepartureSlot[] {
  // TODO: Replace with Supabase query → trips table for actual availability
  // Mock: generate hourly slots 12am–11pm, randomize seats remaining
  const slots: DepartureSlot[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour < 12 ? "AM" : "PM";
    const time = `${hour.toString().padStart(2, "0")}:00`;
    const displayTime = `${h12}:00 ${ampm}`;

    // Mock availability — seed by hour so it's deterministic
    const totalSeats = 8;
    const seatsLeft = hour % 4 === 0 ? Math.floor(Math.random() * 3) : totalSeats - Math.floor(hour % 3);
    const available = seatsLeft > 0;

    slots.push({
      id: `${date}-${from}-${time}`,
      time,
      displayTime,
      available,
      seatsLeft: Math.max(0, Math.min(seatsLeft, totalSeats)),
      totalSeats,
    });
  }

  return slots;
}

// ─── Flight matching ─────────────────────────────────────────────────────────

// Minutes since the Unix epoch for a local date + "HH:MM" (timezone-agnostic:
// both sides of every comparison use the same basis).
function toMinutes(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60000;
}

function fromMinutes(total: number): { date: string; time: string } {
  const d = new Date(total * 60000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

export function shiftDate(date: string, days: number): string {
  return fromMinutes(toMinutes(date, "12:00") + days * 1440).date;
}

// "1 hr 45 min", "45 min", "2 hrs" — or with `long`: "1 hour and 45 minutes"
export function formatDuration(minutes: number, long = false): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hPart = h > 0 ? (long ? `${h} hour${h > 1 ? "s" : ""}` : `${h} hr${h > 1 ? "s" : ""}`) : "";
  const mPart = m > 0 ? (long ? `${m} minute${m > 1 ? "s" : ""}` : `${m} min`) : "";
  return [hPart, mPart].filter(Boolean).join(long ? " and " : " ") || (long ? "0 minutes" : "0 min");
}

// Estimated arrival for a departure at `date` + `time`, given the route time
// (may land on the next day).
export function arrivalFor(date: string, time: string, routeMinutes: number) {
  const arr = fromMinutes(toMinutes(date, time) + routeMinutes);
  return { arrivalDate: arr.date, arrivalTime: arr.time, arrivalDisplayTime: displayTime12h(arr.time) };
}

// "8:00 AM" or, when the arrival estimate is known,
// "Departs 8:00 AM · arrives ATL ~9:45 AM".
export function slotTimes(slot: DepartureSlot, to: LocationKey): string {
  if (!slot.arrivalDisplayTime) return slot.displayTime;
  return `Departs ${slot.displayTime} · arrives ${LOCATIONS[to].short} ~${slot.arrivalDisplayTime}`;
}

// "13:05" → "1:05 PM"
export function displayTime12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  const hour = parseInt(hStr, 10);
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${mStr ?? "00"} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * Volt departure dates that could hold a departure fitting this flight — the
 * fit window can cross midnight (e.g. a 1:00 AM flight needs a shuttle the
 * evening before).
 */
export function candidateDatesForFlight(
  flight: FlightInfo,
  direction: FlightDirection,
  t: FlightTimingSettings,
): string[] {
  const flightAt = toMinutes(flight.date, flight.time);
  const [earliest, latest] =
    direction === "departing"
      ? [flightAt - t.departMaxBufferMinutes - t.routeMinutes, flightAt - t.departMinBufferMinutes - t.routeMinutes]
      : [flightAt + t.arriveMinWaitMinutes, flightAt + t.arriveMaxWaitMinutes];
  const dates: string[] = [];
  for (let d = fromMinutes(earliest).date; d <= fromMinutes(latest).date; d = shiftDate(d, 1)) dates.push(d);
  return dates;
}

export interface FlightMatch {
  slot: DepartureSlot;
  departsAt: { date: string; time: string };
  arrivesAt: { date: string; time: string };   // estimated, using the route time
  gapMinutes: number;   // departing: time at ATL before the flight · arriving: wait after landing
  tight: boolean;       // inside the window but on the short side — flagged to the rider
}

// A gap under this is still offered but labelled "tight".
const TIGHT_DEPART_MINUTES = 90;
const TIGHT_ARRIVE_MINUTES = 45;

/**
 * Filters `slots` (each carrying its own `date`) down to departures that fit
 * the flight, annotated with arrival estimates and the gap to/from the flight.
 * Sorted by smallest gap first — i.e. departing: latest departure first (least
 * waiting at the airport); arriving: earliest pickup first.
 */
export function matchDeparturesToFlight(
  slots: DepartureSlot[],
  flight: FlightInfo,
  direction: FlightDirection,
  t: FlightTimingSettings,
): FlightMatch[] {
  const flightAt = toMinutes(flight.date, flight.time);
  const matches: FlightMatch[] = [];

  for (const slot of slots) {
    if (!slot.date) continue;
    const dep = toMinutes(slot.date, slot.time);
    const arr = dep + t.routeMinutes;
    const gap = direction === "departing" ? flightAt - arr : dep - flightAt;
    const [min, max] =
      direction === "departing"
        ? [t.departMinBufferMinutes, t.departMaxBufferMinutes]
        : [t.arriveMinWaitMinutes, t.arriveMaxWaitMinutes];
    if (gap < min || gap > max) continue;
    matches.push({
      slot,
      departsAt: fromMinutes(dep),
      arrivesAt: fromMinutes(arr),
      gapMinutes: gap,
      tight: gap < (direction === "departing" ? TIGHT_DEPART_MINUTES : TIGHT_ARRIVE_MINUTES),
    });
  }

  return matches.sort((a, b) => a.gapMinutes - b.gapMinutes);
}

// "Delta DL 1234 · departs 10:30 AM · Domestic – South"
export function flightSummary(f: FlightInfo, direction: FlightDirection): string {
  return `${f.airline} ${f.flightNumber} · ${direction === "departing" ? "departs" : "lands"} ${displayTime12h(f.time)} · ${f.terminal}`;
}

// Flight rows sent to /api/booking/create (empty when not in flight mode).
export function bookingFlights(search: BookingSearch, outbound: DepartureSlot, returnSlot: DepartureSlot | null) {
  if (!search.hasFlight) return [];
  const legs: ({ leg: "outbound" | "return"; tripId: string; direction: FlightDirection } & FlightInfo)[] = [
    { leg: "outbound", tripId: outbound.id, direction: flightDirection(search.from), ...search.outboundFlight },
  ];
  if (search.roundTrip && returnSlot) {
    legs.push({ leg: "return", tripId: returnSlot.id, direction: flightDirection(search.to), ...search.returnFlight });
  }
  return legs;
}

// Calculate price breakdown. Pass { militaryDiscount: true } to apply the 5%
// Military & First Responder discount to the whole booking — do this only when
// the customer's account is verified (checked server-side in /api/booking/create).
export function calcPrice(
  search: BookingSearch,
  opts: { militaryDiscount?: boolean } = {},
): PriceBreakdown {
  const adultTotal = search.adults * PRICING.adult;
  const childTotal = search.children * PRICING.child;
  const petTotal = search.pets * PRICING.pet;
  const extraBagTotal = search.extraBags * PRICING.extraBag;
  const oneWaySubtotal = adultTotal + childTotal + petTotal + extraBagTotal;
  const subtotal = search.roundTrip ? oneWaySubtotal * 2 : oneWaySubtotal;

  // Work in cents so the percentage discount is exact.
  const subtotalCents = subtotal * 100;
  const militaryDiscount = !!opts.militaryDiscount;
  const discountCents = militaryDiscount ? Math.round(subtotalCents * MILITARY_DISCOUNT_RATE) : 0;
  const totalCents = subtotalCents - discountCents;

  const lines: { label: string; amount: number }[] = [];
  if (search.adults > 0) lines.push({ label: `${search.adults} Adult${search.adults > 1 ? "s" : ""} × $${PRICING.adult}`, amount: adultTotal });
  if (search.children > 0) lines.push({ label: `${search.children} Child${search.children > 1 ? "ren" : ""} × $${PRICING.child}`, amount: childTotal });
  if (search.pets > 0) lines.push({ label: `${search.pets} Pet${search.pets > 1 ? "s" : ""} × $${PRICING.pet}`, amount: petTotal });
  if (search.extraBags > 0) lines.push({ label: `${search.extraBags} Extra Bag${search.extraBags > 1 ? "s" : ""} × $${PRICING.extraBag}`, amount: extraBagTotal });
  if (search.roundTrip) lines.push({ label: "Round Trip (×2)", amount: oneWaySubtotal });

  return {
    adultTotal, childTotal, petTotal, extraBagTotal, oneWaySubtotal,
    subtotal,
    discount: discountCents / 100,
    total: totalCents / 100,
    subtotalCents,
    discountCents,
    totalCents,
    militaryDiscount,
    lines,
  };
}

// Generate a confirmation number
export function generateConfirmationNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "VOLT-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Format date for display
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00"); // avoid timezone shift
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
