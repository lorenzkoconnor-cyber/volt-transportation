// ─── Volt Transportation Booking Logic ────────────────────────────────────────

export const PRICING = {
  adult: 59,
  child: 49,
  pet: 25,
  extraBag: 10,
} as const;

export const LOCATIONS = {
  columbus: { label: "Columbus, GA", short: "Columbus" },
  atl: { label: "ATL Airport", short: "ATL" },
} as const;

export type LocationKey = keyof typeof LOCATIONS;

export interface BookingSearch {
  from: LocationKey;
  to: LocationKey;
  date: string;
  returnDate: string;   // set when roundTrip is true
  adults: number;
  children: number;
  pets: number;
  extraBags: number;
  roundTrip: boolean;
}

export interface DepartureSlot {
  id: string;
  time: string;         // "08:00"
  displayTime: string;  // "8:00 AM"
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
  total: number;
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

// Calculate price breakdown
export function calcPrice(search: BookingSearch): PriceBreakdown {
  const adultTotal = search.adults * PRICING.adult;
  const childTotal = search.children * PRICING.child;
  const petTotal = search.pets * PRICING.pet;
  const extraBagTotal = search.extraBags * PRICING.extraBag;
  const oneWaySubtotal = adultTotal + childTotal + petTotal + extraBagTotal;
  const total = search.roundTrip ? oneWaySubtotal * 2 : oneWaySubtotal;

  const lines: { label: string; amount: number }[] = [];
  if (search.adults > 0) lines.push({ label: `${search.adults} Adult${search.adults > 1 ? "s" : ""} × $${PRICING.adult}`, amount: adultTotal });
  if (search.children > 0) lines.push({ label: `${search.children} Child${search.children > 1 ? "ren" : ""} × $${PRICING.child}`, amount: childTotal });
  if (search.pets > 0) lines.push({ label: `${search.pets} Pet${search.pets > 1 ? "s" : ""} × $${PRICING.pet}`, amount: petTotal });
  if (search.extraBags > 0) lines.push({ label: `${search.extraBags} Extra Bag${search.extraBags > 1 ? "s" : ""} × $${PRICING.extraBag}`, amount: extraBagTotal });
  if (search.roundTrip) lines.push({ label: "Round Trip (×2)", amount: oneWaySubtotal });

  return { adultTotal, childTotal, petTotal, extraBagTotal, oneWaySubtotal, total, lines };
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
