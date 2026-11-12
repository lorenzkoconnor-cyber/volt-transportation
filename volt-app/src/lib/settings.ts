// ─── App settings (client-safe) ───────────────────────────────────────────────
// Everything owners/managers can change under Dashboard → Settings, as one
// typed object. The server loads it from booking_settings (+ the live website
// banner) in src/lib/settings-server.ts; the browser gets the same object from
// <SettingsProvider> (src/context/SettingsContext.tsx). Nothing in here is
// secret — it's what the public website shows.

import { MILITARY_DISCOUNT_AMOUNT, PRICING } from "@/lib/booking";
import { earliestOnlineDate, easternToday } from "@/lib/format";

export interface Pricing {
  adult: number;    // dollars
  child: number;
  pet: number;
  extraBag: number;
}

export interface BusinessInfo {
  phone: string;      // "(706) 530-5896"
  phoneHref: string;  // "tel:+17065305896"
  email: string;
  street: string;     // "3885 Miller Road, Suite C"
  cityLine: string;   // "Columbus, GA 31909"
  address: string;    // one line, for maps
  hours: string;
}

export interface Announcement {
  id: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
}

export interface RouteSchedule {
  first: string;            // "00:00"
  last: string;             // "22:00"
  intervalMinutes: number;  // 120
  durationMinutes: number;  // drive time
}

export interface AppSettings {
  pricing: Pricing;
  military: { enabled: boolean; amount: number }; // amount: dollars off each booking (and donated)
  business: BusinessInfo;
  arriveEarlyMinutes: number;
  onlineCutoffMinutes: number;
  // Columbus → ATL departure times riders can book online even inside the
  // cutoff above, up to `cutoffMinutes` before departure (owner, 2026-11-12).
  alwaysOpen: { times: string[]; cutoffMinutes: number };
  cancellationFeeCents: number;
  // Team Portal door-to-door service: flat fee for a pickup / drop-off at an address.
  doorService: { pickupCents: number; dropoffCents: number };
  shortNoticeHours: number;
  editCutoffHours: number;
  returnEditCutoffHours: number;
  discountCodeValidDays: number;
  defaultVanCapacity: number;
  reminders: { firstEnabled: boolean; firstHours: number; secondEnabled: boolean; secondHours: number };
  // Review request emails after a trip, and where "Also post on Google" goes.
  reviews: { requestsEnabled: boolean; googleUrl: string | null };
  // Daily departures each way (routes table).
  schedule: { toAtl: RouteSchedule; fromAtl: RouteSchedule };
  announcement: Announcement | null;
}

export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

function business(phone: string, email: string, street: string, cityLine: string, hours: string): BusinessInfo {
  return {
    phone, phoneHref: phoneHref(phone), email, street, cityLine,
    address: `${street.replace(/,\s*/g, " ")}, ${cityLine}`, hours,
  };
}

export const DEFAULT_ALWAYS_OPEN_TIMES = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

export const DEFAULT_SETTINGS: AppSettings = {
  pricing: { ...PRICING },
  military: { enabled: true, amount: MILITARY_DISCOUNT_AMOUNT },
  business: business("(706) 530-5896", "support@contactvolt.com", "3885 Miller Road, Suite C", "Columbus, GA 31909", "Mon–Sat · 4:00 AM – 12:00 AM · Sun: open for booked trips only"),
  arriveEarlyMinutes: 20,
  onlineCutoffMinutes: 1440,
  alwaysOpen: { times: [...DEFAULT_ALWAYS_OPEN_TIMES], cutoffMinutes: 60 },
  cancellationFeeCents: 1500,
  doorService: { pickupCents: 5000, dropoffCents: 5000 },
  shortNoticeHours: 36,
  editCutoffHours: 24,
  returnEditCutoffHours: 2,
  discountCodeValidDays: 3,
  defaultVanCapacity: 8,
  reminders: { firstEnabled: true, firstHours: 24, secondEnabled: true, secondHours: 2 },
  reviews: { requestsEnabled: true, googleUrl: null },
  schedule: {
    toAtl: { first: "00:00", last: "22:00", intervalMinutes: 120, durationMinutes: 120 },
    fromAtl: { first: "00:00", last: "22:00", intervalMinutes: 120, durationMinutes: 120 },
  },
  announcement: null,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: any, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
const bool = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);

function routeSchedule(r: any, d: RouteSchedule): RouteSchedule {
  if (!r) return d;
  return {
    first: str(r.first_departure_time, d.first).slice(0, 5),
    last: str(r.last_departure_time, d.last).slice(0, 5),
    intervalMinutes: num(r.departure_interval_minutes, d.intervalMinutes),
    durationMinutes: num(r.duration_minutes, d.durationMinutes),
  };
}

/** booking_settings row + routes rows (+ live banner) → AppSettings, with defaults for anything missing. */
export function settingsFromRow(row: any, announcement: Announcement | null = null, routes: any[] = []): AppSettings {
  const d = DEFAULT_SETTINGS;
  const schedule = {
    toAtl: routeSchedule(routes.find((r) => r.origin_key === "columbus"), d.schedule.toAtl),
    fromAtl: routeSchedule(routes.find((r) => r.origin_key === "atl"), d.schedule.fromAtl),
  };
  if (!row) return { ...d, schedule, announcement };
  return {
    pricing: {
      adult: num(row.price_adult_cents, d.pricing.adult * 100) / 100,
      child: num(row.price_child_cents, d.pricing.child * 100) / 100,
      pet: num(row.price_pet_cents, d.pricing.pet * 100) / 100,
      extraBag: num(row.price_extra_bag_cents, d.pricing.extraBag * 100) / 100,
    },
    military: { enabled: bool(row.military_discount_enabled, true), amount: num(row.military_discount_amount_cents, d.military.amount * 100) / 100 },
    business: business(
      str(row.business_phone, d.business.phone),
      str(row.business_email, d.business.email),
      str(row.business_street, d.business.street),
      str(row.business_city_line, d.business.cityLine),
      str(row.business_hours, d.business.hours),
    ),
    arriveEarlyMinutes: num(row.arrive_early_minutes, d.arriveEarlyMinutes),
    onlineCutoffMinutes: num(row.online_booking_cutoff_minutes, d.onlineCutoffMinutes),
    alwaysOpen: {
      times: Array.isArray(row.always_open_times)
        ? row.always_open_times.map((t: unknown) => String(t).slice(0, 5)).filter((t: string) => /^\d{2}:\d{2}$/.test(t))
        : d.alwaysOpen.times,
      cutoffMinutes: num(row.always_open_cutoff_minutes, d.alwaysOpen.cutoffMinutes),
    },
    cancellationFeeCents: num(row.cancellation_fee_cents, d.cancellationFeeCents),
    doorService: {
      pickupCents: num(row.door_pickup_fee_cents, d.doorService.pickupCents),
      dropoffCents: num(row.door_dropoff_fee_cents, d.doorService.dropoffCents),
    },
    shortNoticeHours: num(row.short_notice_hours, d.shortNoticeHours),
    editCutoffHours: num(row.staff_edit_cutoff_hours, d.editCutoffHours),
    returnEditCutoffHours: num(row.return_edit_cutoff_hours, d.returnEditCutoffHours),
    discountCodeValidDays: num(row.discount_code_valid_days, d.discountCodeValidDays),
    defaultVanCapacity: num(row.default_van_capacity, d.defaultVanCapacity),
    reminders: {
      firstEnabled: bool(row.reminder_first_enabled, true),
      firstHours: num(row.reminder_first_hours, 24),
      secondEnabled: bool(row.reminder_second_enabled, true),
      secondHours: num(row.reminder_second_hours, 2),
    },
    reviews: {
      requestsEnabled: bool(row.review_requests_enabled, true),
      googleUrl: typeof row.google_review_url === "string" && row.google_review_url.startsWith("https://") ? row.google_review_url : null,
    },
    schedule,
    announcement,
  };
}

/** The Military Discount in dollars to apply now (0 when the program is switched off). */
export function militaryAmount(s: AppSettings): number {
  return s.military.enabled ? s.military.amount : 0;
}

// ── Price snapshot ───────────────────────────────────────────────────────────
// Stored on each reservation (and checkout) so a later price change never
// alters an existing booking's receipt, edits, or Military Discount capture.
export interface PricingSnapshot {
  adult_cents: number;
  child_cents: number;
  pet_cents: number;
  extra_bag_cents: number;
  military_amount_cents: number;
  military_percent?: number; // bookings made while the discount was a percentage
}

export function snapshotFrom(s: AppSettings): PricingSnapshot {
  return {
    adult_cents: Math.round(s.pricing.adult * 100),
    child_cents: Math.round(s.pricing.child * 100),
    pet_cents: Math.round(s.pricing.pet * 100),
    extra_bag_cents: Math.round(s.pricing.extraBag * 100),
    military_amount_cents: Math.round(s.military.amount * 100),
  };
}

/** A booking's prices. Bookings made before snapshots existed used the original prices. */
export function snapshotPricing(snap: Partial<PricingSnapshot> | null | undefined): { pricing: Pricing; militaryAmount: number } {
  return {
    pricing: {
      adult: num(snap?.adult_cents, PRICING.adult * 100) / 100,
      child: num(snap?.child_cents, PRICING.child * 100) / 100,
      pet: num(snap?.pet_cents, PRICING.pet * 100) / 100,
      extraBag: num(snap?.extra_bag_cents, PRICING.extraBag * 100) / 100,
    },
    // Older snapshots stored a percentage; they're settled at the flat amount.
    militaryAmount: num(snap?.military_amount_cents, MILITARY_DISCOUNT_AMOUNT * 100) / 100,
  };
}

/** "$59" / "$12.50" */
export function dollars(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

// ── Online booking cutoff ─────────────────────────────────────────────────────
type CutoffSettings = Pick<AppSettings, "onlineCutoffMinutes" | "alwaysOpen">;

/** Is this one of the always-bookable Columbus → ATL departures? */
export function isAlwaysOpen(s: CutoffSettings, originKey: string | null | undefined, time: string): boolean {
  return originKey === "columbus" && s.alwaysOpen.times.includes(String(time).slice(0, 5));
}

/** How many minutes before this departure online booking closes. */
export function onlineCutoffFor(s: CutoffSettings, originKey: string | null | undefined, time: string): number {
  return isAlwaysOpen(s, originKey, time) ? Math.min(s.alwaysOpen.cutoffMinutes, s.onlineCutoffMinutes) : s.onlineCutoffMinutes;
}

/**
 * First date riders may pick online: today when leaving Columbus and one of
 * today's always-bookable times is still open, otherwise the usual cutoff.
 */
export function earliestOnlineDateFrom(s: CutoffSettings, from: string | null | undefined, now: Date = new Date()): string {
  const usual = earliestOnlineDate(s.onlineCutoffMinutes, now);
  if (from !== "columbus" || !s.alwaysOpen.times.length) return usual;
  const [h, m] = now.toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false }).split(":").map(Number);
  const nowMinutes = (h % 24) * 60 + m;
  const cutoff = Math.min(s.alwaysOpen.cutoffMinutes, s.onlineCutoffMinutes);
  const openToday = s.alwaysOpen.times.some((t) => {
    const [th, tm] = t.split(":").map(Number);
    return th * 60 + tm - nowMinutes >= cutoff;
  });
  return openToday ? easternToday(now) : usual;
}

// "14:00" → "2 PM", "06:30" → "6:30 AM".
function shortTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

const minutesWords = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

/**
 * The online booking rule in one sentence (no trailing period), e.g. "Online
 * bookings need at least 24 hours' notice, except Columbus → ATL departures at
 * 6 AM, 8 AM, … 8 PM, which you can book online until 1 hour before departure".
 */
export function onlineNoticeRule(s: CutoffSettings): string {
  const base = `Online bookings need at least ${minutesWords(s.onlineCutoffMinutes)} notice`;
  const times = [...s.alwaysOpen.times].sort();
  if (!times.length || s.alwaysOpen.cutoffMinutes >= s.onlineCutoffMinutes) return base;
  return `${base}, except Columbus → ATL departures at ${times.map(shortTime).join(", ")}, ` +
    `which you can book online until ${minutesWords(s.alwaysOpen.cutoffMinutes)} before departure`;
}
