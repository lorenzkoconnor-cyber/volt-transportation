// ─── Customer reviews (client-safe, pure) ─────────────────────────────────────
// Validation and the automatic content check for reviews customers write at
// /review/<token>. A review publishes right away unless it contains something
// that shouldn't go on the homepage unseen — links, contact details or
// profanity — in which case it's HELD for an owner/manager.
//
// Never hold or hide a review because of its star rating: the FTC's 2024 rule
// on consumer reviews bans suppressing negative reviews. Content rules only.

export const REVIEW_MAX_LENGTH = 1000;
export const NAME_MAX_LENGTH = 40;

export interface ReviewInput {
  rating: number;
  body: string;
  displayName: string;
}

export type ReviewCheck =
  | { ok: true; value: ReviewInput; holdReason: string | null }
  | { ok: false; error: string };

// Whole-word matches (so "Scunthorpe"-style false positives stay rare).
const PROFANITY = [
  "fuck", "fucking", "fucked", "shit", "shitty", "bitch", "bastard", "asshole", "dick", "cunt",
  "damn", "piss", "pussy", "slut", "whore", "nigger", "nigga", "faggot", "retard",
];
const PROFANITY_RE = new RegExp(`\\b(${PROFANITY.join("|")})\\b`, "i");
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|us|info|biz|xyz)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

/** Why a review needs a person to look at it first, or null to publish now. */
export function holdReasonFor(text: string): string | null {
  if (EMAIL_RE.test(text)) return "Contains an email address";
  if (LINK_RE.test(text)) return "Contains a link";
  if (PHONE_RE.test(text)) return "Contains a phone number";
  if (PROFANITY_RE.test(text)) return "Contains profanity";
  return null;
}

/** "Jordan Miles" → "Jordan M." (what shows on the website by default). */
export function defaultDisplayName(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f) return "Volt rider";
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

export function checkReview(raw: { rating?: unknown; body?: unknown; displayName?: unknown }): ReviewCheck {
  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Pick 1 to 5 stars." };
  const body = clean(raw.body, REVIEW_MAX_LENGTH + 1);
  if (body.length < 10) return { ok: false, error: "Tell us a little more — at least a few words." };
  if (body.length > REVIEW_MAX_LENGTH) return { ok: false, error: `Keep it under ${REVIEW_MAX_LENGTH} characters.` };
  const displayName = clean(raw.displayName, NAME_MAX_LENGTH + 1).replace(/\n/g, " ");
  if (!displayName) return { ok: false, error: "Enter the name to show with your review." };
  if (displayName.length > NAME_MAX_LENGTH) return { ok: false, error: `Keep the name under ${NAME_MAX_LENGTH} characters.` };
  return {
    ok: true,
    value: { rating, body, displayName },
    holdReason: holdReasonFor(`${body}\n${displayName}`),
  };
}

/** "October 2026" */
export function reviewMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });
}
