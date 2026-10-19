// ─── Website wording that depends on Settings (client-safe) ──────────────────
// Shared by the homepage FAQ and its search-engine data so both always state
// the current prices, hours, fee and contact details.

import { dollars, type AppSettings, type RouteSchedule } from "@/lib/settings";
import { displayTime12h } from "@/lib/booking";

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

const runs = (r: RouteSchedule) =>
  `${every(r.intervalMinutes)} from ${displayTime12h(r.first)} to ${displayTime12h(r.last)}`;

/** "Vans leave Volt in Columbus every 2 hours from 4:00 AM to 8:00 PM, 7 days a week, and leave ATL …" */
export function scheduleSentence(s: AppSettings): string {
  return `Vans leave Volt in Columbus ${runs(s.schedule.toAtl)}, 7 days a week, and leave ATL ${runs(s.schedule.fromAtl)}.`;
}

export function cancellationSentence(s: AppSettings): string {
  const fee = s.cancellationFeeCents > 0 ? ` minus a ${dollars(s.cancellationFeeCents / 100)} cancellation fee` : "";
  return `You can cancel up until 11:59 PM (Eastern) the day before your scheduled trip and receive a refund of your fare${fee} — online cancellations are refunded automatically. Cancellations after that time are non-refundable. To change your booking, call us; there's no change fee.`;
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
