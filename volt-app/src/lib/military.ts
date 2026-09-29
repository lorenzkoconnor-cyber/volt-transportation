// ─── Military Discount program — shared constants ─────────────────────────────
// One source of truth for both the customer-facing UI and the server routes.
//
// Eligibility: ACTIVE-DUTY and RETIRED military only. Former service members who
// did not retire, and first responders, are not eligible.

export const MILITARY_BUCKET = "military-ids";

export type MilitaryStatus = "none" | "pending" | "approved" | "rejected";
export type MilitaryCategory = "active_duty" | "retired";

export const MILITARY_CATEGORIES: { value: MilitaryCategory; label: string; hint: string }[] = [
  {
    value: "active_duty",
    label: "Active Duty",
    hint: "Currently serving on active duty",
  },
  {
    value: "retired",
    label: "Retired Military",
    hint: "Retired from the U.S. military",
  },
];

export function isMilitaryCategory(value: string): value is MilitaryCategory {
  return MILITARY_CATEGORIES.some((c) => c.value === value);
}

// Legacy values from before eligibility was narrowed (Sept 2026) — shown so
// staff can tell old records apart; they are no longer accepted on upload.
const LEGACY_LABELS: Record<string, string> = {
  military: "Military (old program)",
  first_responder: "First Responder (no longer eligible)",
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return MILITARY_CATEGORIES.find((c) => c.value === value)?.label ?? LEGACY_LABELS[value] ?? value;
}

// ─── Giving back ───────────────────────────────────────────────────────────────
// Volt donates 10% of its profits to Warrior Outreach Ranch. This is separate
// from the discount — it is NOT tied to how much riders save.
export const DONATION_PERCENT_OF_PROFITS = 10;
export const DONATION_PARTNER = {
  name: "Warrior Outreach Ranch",
  location: "Fortson, Georgia",
  url: "https://warrioroutreachranch.org",
  displayUrl: "warrioroutreachranch.org",
} as const;

// Accepted proof-of-service uploads. Kept small on purpose — a phone photo or a
// scan of a service/department ID.
export const MILITARY_ID_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
export const MILITARY_ID_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

export function isAllowedIdFile(type: string, size: number): { ok: boolean; error?: string } {
  if (!ALLOWED_MIME.has(type)) {
    return { ok: false, error: "Please upload a JPG, PNG, WEBP, HEIC, or PDF." };
  }
  if (size > MILITARY_ID_MAX_BYTES) {
    return { ok: false, error: "File is too large — max 10 MB." };
  }
  return { ok: true };
}

export function extForMime(type: string): string {
  switch (type) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/heic": return "heic";
    case "application/pdf": return "pdf";
    default: return "bin";
  }
}
