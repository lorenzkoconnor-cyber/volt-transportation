// "How did you hear about us?" — an optional one-tap question at online
// checkout, saved on the reservation (reservations.heard_from). Ads and QR
// codes are tracked by utm tags (attribution.ts); this catches everything
// else, like word of mouth or seeing the van. Picking "Other" lets the rider
// type where (optional, reservations.heard_from_other).

export const HEARD_FROM_OPTIONS = [
  { value: "google", label: "Google" },
  { value: "facebook_instagram", label: "Facebook / Instagram" },
  { value: "tv", label: "TV commercial" },
  { value: "friend_family", label: "Friend or family" },
  { value: "saw_volt", label: "Saw our van, office or flyer" },
  { value: "other", label: "Other" },
] as const;

export const HEARD_FROM_OTHER_MAX = 200;

export type HeardFrom = (typeof HEARD_FROM_OPTIONS)[number]["value"];

export function normalizeHeardFrom(v: unknown): HeardFrom | null {
  return HEARD_FROM_OPTIONS.find((o) => o.value === v)?.value ?? null;
}

// The typed "Other" detail — kept only when the answer is "other".
export function normalizeHeardFromOther(heardFrom: HeardFrom | null, v: unknown): string | null {
  if (heardFrom !== "other") return null;
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, HEARD_FROM_OTHER_MAX) || null;
}

export function heardFromLabel(v: string | null | undefined): string | null {
  return HEARD_FROM_OPTIONS.find((o) => o.value === v)?.label ?? null;
}
