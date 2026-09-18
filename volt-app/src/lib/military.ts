// ─── Military & First Responder program — shared constants ────────────────────
// One source of truth for both the customer-facing UI and the server routes.

export const MILITARY_BUCKET = "military-ids";

export type MilitaryStatus = "none" | "pending" | "approved" | "rejected";
export type MilitaryCategory = "military" | "first_responder";

export const MILITARY_CATEGORIES: { value: MilitaryCategory; label: string; hint: string }[] = [
  {
    value: "military",
    label: "Military",
    hint: "Active duty, reserve, National Guard, or veteran",
  },
  {
    value: "first_responder",
    label: "First Responder",
    hint: "Police, firefighter, EMT/paramedic, or dispatcher",
  },
];

export function categoryLabel(value: string | null | undefined): string {
  return MILITARY_CATEGORIES.find((c) => c.value === value)?.label ?? "—";
}

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
