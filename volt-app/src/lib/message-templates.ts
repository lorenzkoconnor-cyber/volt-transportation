// ─── Customer message wording (client-safe) ───────────────────────────────────
// Default text for every customer text/email, the {placeholders} each one can
// use, and the renderer. Owners/managers can override any of these under
// Dashboard → Settings → Message Wording (stored in message_templates); an
// empty override means "use the default".

export type TemplateKey = "confirmation" | "reminder_first" | "reminder_second" | "updated" | "cancelled" | "receipt" | "review_request";

export interface TemplateText {
  sms: string;
  emailSubject: string;  // "" for text-only messages
  emailBody: string;
}

export interface TemplateInfo {
  key: TemplateKey;
  label: string;
  description: string;
  hasEmail: boolean;
  hasSms?: boolean;      // false = email only (default true)
  button?: string;       // the email's button (default "View receipt")
  placeholders: { name: string; help: string }[];
  sample: Record<string, string>;   // used for previews and "send me a test"
}

const COMMON = [
  { name: "name", help: "Customer's first name" },
  { name: "confirmation", help: "Confirmation number, e.g. VOLT-AB12CD" },
  { name: "phone", help: "Volt's phone number (Business Info)" },
];

const SAMPLE_COMMON = { name: "Jordan", confirmation: "VOLT-AB12CD", phone: "(706) 530-5896", arrive_minutes: "20" };

export const TEMPLATES: TemplateInfo[] = [
  {
    key: "confirmation",
    label: "Booking confirmation",
    description: "Sent right after a booking is paid (online or by staff).",
    hasEmail: true,
    placeholders: [
      ...COMMON,
      { name: "route", help: "e.g. Volt Columbus → ATL Airport" },
      { name: "date", help: "Departure date, e.g. Friday, October 24, 2026" },
      { name: "time", help: "Departure time, e.g. 6:00 AM" },
      { name: "return_line", help: "\"Return: Fri, Oct 26 at 6:00 PM\" — blank for one-way (the line is removed)" },
      { name: "receipt_link", help: "Link to the receipt" },
      { name: "arrive_minutes", help: "Arrive-early minutes (Settings)" },
    ],
    sample: {
      ...SAMPLE_COMMON, route: "Volt Columbus → ATL Airport", date: "Friday, October 24, 2026", time: "6:00 AM",
      return_line: "Return: Oct 26 at 6:00 PM", receipt_link: "https://volt-transportation.com/receipt/…",
    },
  },
  {
    key: "reminder_first",
    label: "First trip reminder",
    description: "Text + email sent before each departure (timing set under Reminders).",
    hasEmail: true,
    placeholders: [
      ...COMMON,
      { name: "when", help: "\"tomorrow\", \"today\", or \"on Friday\"" },
      { name: "time", help: "Departure time" },
      { name: "from", help: "Pickup location" },
      { name: "arrive_minutes", help: "Arrive-early minutes" },
    ],
    sample: { ...SAMPLE_COMMON, when: "tomorrow", time: "6:00 AM", from: "Columbus, GA" },
  },
  {
    key: "reminder_second",
    label: "Second trip reminder",
    description: "Text + email sent shortly before each departure (timing set under Reminders).",
    hasEmail: true,
    placeholders: [
      ...COMMON,
      { name: "hours", help: "How long until departure, e.g. \"2 hours\"" },
      { name: "time", help: "Departure time" },
      { name: "from", help: "Pickup location" },
      { name: "arrive_minutes", help: "Arrive-early minutes" },
    ],
    sample: { ...SAMPLE_COMMON, hours: "2 hours", time: "6:00 AM", from: "Columbus, GA" },
  },
  {
    key: "updated",
    label: "Reservation changed",
    description: "Sent after staff edit a reservation.",
    hasEmail: true,
    placeholders: [
      ...COMMON,
      { name: "changes", help: "\"Changed: date; passengers\"" },
      { name: "trip_line", help: "The trip as it is now" },
      { name: "receipt_link", help: "Link to the updated receipt" },
    ],
    sample: {
      ...SAMPLE_COMMON, changes: "Changed: Departure time", trip_line: "Now: Oct 24 at 8:00 AM, Volt Columbus → ATL Airport",
      receipt_link: "https://volt-transportation.com/receipt/…",
    },
  },
  {
    key: "cancelled",
    label: "Reservation cancelled",
    description: "Sent when a reservation is cancelled (online, by staff, or a service pause).",
    hasEmail: true,
    placeholders: [
      ...COMMON,
      { name: "refund_details", help: "What happens to their money (fee, refund, card hold)" },
    ],
    sample: {
      ...SAMPLE_COMMON,
      refund_details: "A $15.00 cancellation fee applies. $103.00 is being refunded to your card (allow 5–10 business days).",
    },
  },
  {
    key: "receipt",
    label: "Receipt",
    description: "Sent when staff press Text Receipt or Email Receipt.",
    hasEmail: true,
    placeholders: [...COMMON, { name: "receipt_link", help: "Link to the receipt" }],
    sample: { ...SAMPLE_COMMON, receipt_link: "https://volt-transportation.com/receipt/…" },
  },
  {
    key: "review_request",
    label: "Review request",
    description: "Emailed 2 hours after a customer's first completed trip leg (turn it off under Settings → Reviews). Email only.",
    hasEmail: true,
    hasSms: false,
    button: "Leave a review",
    placeholders: COMMON,
    sample: SAMPLE_COMMON,
  },
];

export const DEFAULT_TEMPLATES: Record<TemplateKey, TemplateText> = {
  confirmation: {
    sms:
      "Volt Transportation: Hi {name}! Your ride is confirmed.\n\n" +
      "Confirmation: {confirmation}\n{route}\n{date} at {time}\n{return_line}\n\n" +
      "Receipt: {receipt_link}\n\n" +
      "Arrive {arrive_minutes} min early. Reply STOP to opt out.",
    emailSubject: "Your Volt ride is confirmed — {confirmation}",
    emailBody:
      "Hi {name}! Your ride is confirmed.\n\n" +
      "Confirmation: {confirmation}\n{route}\n{date} at {time}\n{return_line}\n\n" +
      "Please arrive {arrive_minutes} minutes early. Questions? Reply to this email or call us at {phone}.",
  },
  reminder_first: {
    sms:
      "Volt Transportation: Reminder — your ride departs {when} at {time} from {from}.\n\n" +
      "Confirmation: {confirmation}\nPlease arrive {arrive_minutes} minutes early. See you soon!",
    emailSubject: "Reminder: your Volt ride is {when} at {time} — {confirmation}",
    emailBody:
      "Hi {name}, this is a reminder that your ride departs {when} at {time} from {from}.\n\n" +
      "Confirmation: {confirmation}\n\n" +
      "Please arrive {arrive_minutes} minutes early. Questions? Reply to this email or call us at {phone}.",
  },
  reminder_second: {
    sms:
      "Volt Transportation: Hi {name}, your ride departs in about {hours} — {time} from {from}.\n\n" +
      "Confirmation: {confirmation}\nPlease arrive {arrive_minutes} minutes early.",
    emailSubject: "Your Volt ride departs in about {hours} — {confirmation}",
    emailBody:
      "Hi {name}, your ride departs in about {hours} — {time} from {from}.\n\n" +
      "Confirmation: {confirmation}\n\n" +
      "Please arrive {arrive_minutes} minutes early. Running late? Call us at {phone}.",
  },
  updated: {
    sms:
      "Volt Transportation: Your reservation {confirmation} has been updated.\n\n" +
      "{changes}\n{trip_line}\n\nUpdated receipt: {receipt_link}\n\n" +
      "Questions? Reply to this text or call us at {phone}.",
    emailSubject: "Your Volt reservation was updated — {confirmation}",
    emailBody:
      "Hi {name}, your reservation {confirmation} has been updated.\n\n{changes}\n{trip_line}\n\n" +
      "Questions? Reply to this email or call us at {phone}.",
  },
  cancelled: {
    sms:
      "Volt Transportation: Your reservation {confirmation} has been cancelled.\n\n" +
      "{refund_details}\nBook again anytime at volt-transportation.com",
    emailSubject: "Your Volt reservation was cancelled — {confirmation}",
    emailBody:
      "Hi {name}, your reservation {confirmation} has been cancelled.\n\n{refund_details}\n\n" +
      "Questions? Reply to this email or call us at {phone}.",
  },
  receipt: {
    sms: "Volt Transportation: Hi {name}, here is your receipt for {confirmation}:\n{receipt_link}",
    emailSubject: "Your Volt receipt — {confirmation}",
    emailBody: "Hi {name},\n\nThank you for riding with Volt Transportation. Your receipt for {confirmation} is linked below.",
  },
  review_request: {
    sms: "",
    emailSubject: "How was your Volt ride, {name}?",
    emailBody:
      "Hi {name},\n\nThanks for riding with Volt Transportation! We'd love to hear how your trip went.\n\n" +
      "It takes less than a minute, and your review helps other travelers find a reliable ride to and from the airport.\n\n" +
      "Questions or a problem with your trip? Reply to this email or call us at {phone}.",
  },
};

/** A stored override (null/blank fields fall back to the default). */
export interface TemplateOverride {
  key: string;
  sms_body: string | null;
  email_subject: string | null;
  email_body: string | null;
}

export function mergeTemplate(key: TemplateKey, o: TemplateOverride | null | undefined): TemplateText {
  const d = DEFAULT_TEMPLATES[key];
  const pick = (v: string | null | undefined, fallback: string) => (v && v.trim() ? v : fallback);
  return {
    sms: pick(o?.sms_body, d.sms),
    emailSubject: pick(o?.email_subject, d.emailSubject),
    emailBody: pick(o?.email_body, d.emailBody),
  };
}

/**
 * Fill {placeholders}. A line that only held placeholders which came out empty
 * (e.g. {return_line} on a one-way trip) is removed; unknown placeholders
 * become blank; runs of blank lines collapse to one.
 */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .split("\n")
    .map((line) => {
      const hadPlaceholder = /\{[a-z_]+\}/.test(line);
      const out = line.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
        const v = vars[k];
        return v == null ? "" : String(v);
      });
      return hadPlaceholder && !out.trim() ? null : out;
    })
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Placeholders a template uses that this message type doesn't provide. */
export function unknownPlaceholders(key: TemplateKey, text: string): string[] {
  const allowed = new Set(TEMPLATES.find((t) => t.key === key)!.placeholders.map((p) => p.name));
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))].filter((p) => !allowed.has(p));
}
