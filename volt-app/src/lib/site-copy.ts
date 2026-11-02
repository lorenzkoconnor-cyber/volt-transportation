// ─── Website wording that depends on Settings (client-safe) ──────────────────
// Shared by the homepage FAQ and its search-engine data so both always state
// the current prices, hours, fee and contact details.

import { dollars, type AppSettings, type RouteSchedule } from "@/lib/settings";
import { CANCEL_NOTICE_HOURS, displayTime12h, runsAroundTheClock } from "@/lib/booking";

function every(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "every hour" : `every ${h} hours`;
  }
  return `every ${minutes} minutes`;
}

function driveTime(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  return h ? `${h} hr ${minutes % 60} min` : `${minutes} minutes`;
}

/** Departures run all day and night, e.g. 12:00 AM–10:00 PM every 2 hours. */
export const aroundTheClock = (r: RouteSchedule) => runsAroundTheClock(r.first, r.last, r.intervalMinutes);

/** "around the clock" or "from 4:00 AM to 8:00 PM" */
export const departureHours = (r: RouteSchedule) =>
  aroundTheClock(r) ? "around the clock" : `from ${displayTime12h(r.first)} to ${displayTime12h(r.last)}`;

/** "24/7" or "4:00 AM–8:00 PM daily" */
export const departureWindow = (r: RouteSchedule) =>
  aroundTheClock(r) ? "24/7" : `${displayTime12h(r.first)}–${displayTime12h(r.last)} daily`;

const runs = (r: RouteSchedule) =>
  aroundTheClock(r)
    ? `${every(r.intervalMinutes)}, 24 hours a day`
    : `${every(r.intervalMinutes)} from ${displayTime12h(r.first)} to ${displayTime12h(r.last)}`;

/** "Vans leave Volt in Columbus and ATL every 2 hours, 24 hours a day, 7 days a week." */
export function scheduleSentence(s: AppSettings): string {
  const { toAtl, fromAtl } = s.schedule;
  if (aroundTheClock(toAtl) && aroundTheClock(fromAtl) && toAtl.intervalMinutes === fromAtl.intervalMinutes) {
    return `Vans leave Volt in Columbus and ATL ${runs(toAtl)}, 7 days a week.`;
  }
  return `Vans leave Volt in Columbus ${runs(toAtl)}, 7 days a week, and leave ATL ${runs(fromAtl)}.`;
}

/** The lobby opens for every van, even outside office hours. */
export const LOBBY_OPEN_SENTENCE =
  "Outside office hours, a Volt team member opens our Columbus lobby for every scheduled departure and arrival, day or night, so you can relax inside until it's time to board.";

export function cancellationSentence(s: AppSettings): string {
  const fee = s.cancellationFeeCents > 0 ? ` minus a ${dollars(s.cancellationFeeCents / 100)} cancellation fee` : "";
  return `You can cancel up to ${CANCEL_NOTICE_HOURS} hours before your scheduled departure and receive a refund of your fare${fee} — online cancellations are refunded automatically. Cancellations with less than ${CANCEL_NOTICE_HOURS} hours' notice are non-refundable. To change your booking, call us; there's no change fee.`;
}

export function faqItems(s: AppSettings): { question: string; answer: string }[] {
  const P = s.pricing;
  const b = s.business;
  return [
    {
      question: "How much does transportation from Columbus GA to Atlanta Airport cost?",
      answer: `Adult seats are ${dollars(P.adult)} each. Children (under 12) are ${dollars(P.child)}. Pets are ${dollars(P.pet)} and extra bags are ${dollars(P.extraBag)} each. There are no hidden fees — what you see at booking is what you pay.`,
    },
    {
      question: "Where does Volt pick up passengers in Columbus?",
      answer: `All Columbus trips depart from our office at ${b.street}, ${b.cityLine}. Free parking is available on site. Please arrive at least ${s.arriveEarlyMinutes} minutes before your scheduled departure.`,
    },
    {
      question: "Can I bring luggage?",
      answer: `Yes. Each passenger may bring one standard bag at no charge. Additional bags are ${dollars(P.extraBag)} each. Our drivers provide full luggage assistance loading and unloading.`,
    },
    {
      question: "Can I travel with a pet?",
      answer: `Yes — pets are welcome aboard Volt for ${dollars(P.pet)} per pet. Pets must be in an appropriate carrier or crate for the duration of the trip.`,
    },
    {
      question: "Is the Columbus lobby open for late-night and early-morning trips?",
      answer: `Yes. ${LOBBY_OPEN_SENTENCE} Free parking is available on site.`,
    },
    {
      question: "How early should I arrive for pickup?",
      answer: `We recommend arriving at the pickup location at least ${s.arriveEarlyMinutes} minutes before your scheduled departure. The shuttle departs on schedule, so punctuality is important.`,
    },
    {
      question: "How long does the trip take?",
      answer: `The trip from Columbus, GA to Atlanta Hartsfield-Jackson Airport takes about ${driveTime(s.schedule.toAtl.durationMinutes)} each way. ${scheduleSentence(s)}`,
    },
    {
      question: "Can I bring a wheelchair or walker?",
      answer: `Yes. Folding wheelchairs, walkers and other mobility aids ride free. Our vans don't have a lift, so riders need to be able to move into a van seat — our driver is happy to help. Check "I need mobility assistance" when booking, or call ${b.phone} if you have questions.`,
    },
    { question: "What is the cancellation policy?", answer: cancellationSentence(s) },
    ...(s.military.enabled
      ? [{
          question: "Do you offer a military discount?",
          answer: `Yes. Active-duty and retired military save ${dollars(s.military.amount)} on every booking after a one-time ID verification, and for every one of those bookings Volt donates ${dollars(s.military.amount)} to Warrior Outreach Ranch to support local veterans. See our Military & Giving Back page for details.`,
        }]
      : []),
    {
      question: "Do I need to create an account to book?",
      answer: "No account is required. You can book as a guest and manage your reservation using your confirmation number and phone number.",
    },
  ];
}

// Volt's Google Business Profile on Google Maps. Linked from the homepage
// address button and listed in the search-engine data (hasMap / sameAs) so
// Google can tie the website to the listing.
export const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/place/Volt+Transportation/@32.5253568,-84.9317412,898m/data=!3m2!1e3!4b1!4m6!3m5!1s0x88f3336eda4034f7:0xc1c728a249a51711!8m2!3d32.5253523!4d-84.9291663!16s%2Fg%2F11zzq442gb";

// Volt's social profiles — the homepage "Find us on social media" buttons and
// the search-engine data (sameAs).
export const FACEBOOK_URL = "https://www.facebook.com/people/Volt-Transportation/61595416580595/";
export const INSTAGRAM_URL = "https://www.instagram.com/volt_transportation/";
