// ─── Editable booking_settings fields (client-safe) ───────────────────────────
// One list drives the Settings form, the server's validation in /api/settings,
// and the wording of the change history ("Adult fare: $59.00 → $65.00").

// "url": an optional https:// link — blank clears it.
export type FieldKind = "money" | "int" | "bool" | "text" | "email" | "phone" | "url";

export interface FieldDef {
  column: string;
  label: string;
  kind: FieldKind;
  min?: number;          // int: value; money: dollars
  max?: number;
  maxLength?: number;    // text
}

export const SETTINGS_FIELDS: FieldDef[] = [
  // Prices
  { column: "price_adult_cents", label: "Adult fare", kind: "money", min: 0, max: 1000 },
  { column: "price_child_cents", label: "Child fare", kind: "money", min: 0, max: 1000 },
  { column: "price_pet_cents", label: "Pet fee", kind: "money", min: 0, max: 1000 },
  { column: "price_extra_bag_cents", label: "Extra bag fee", kind: "money", min: 0, max: 1000 },
  { column: "door_pickup_fee_cents", label: "Door pickup fee", kind: "money", min: 0, max: 1000 },
  { column: "door_dropoff_fee_cents", label: "Door drop-off fee", kind: "money", min: 0, max: 1000 },
  // Booking rules
  { column: "online_booking_cutoff_minutes", label: "Online booking cutoff (minutes)", kind: "int", min: 0, max: 1440 },
  { column: "short_notice_hours", label: "Short-notice window (hours)", kind: "int", min: 0, max: 72 },
  { column: "cancellation_fee_cents", label: "Cancellation fee", kind: "money", min: 0, max: 1000 },
  { column: "arrive_early_minutes", label: "Arrive early (minutes)", kind: "int", min: 0, max: 120 },
  { column: "default_van_capacity", label: "Seats per van", kind: "int", min: 1, max: 60 },
  // Reminders
  { column: "reminder_first_enabled", label: "First reminder on", kind: "bool" },
  { column: "reminder_first_hours", label: "First reminder (hours before)", kind: "int", min: 2, max: 72 },
  { column: "reminder_second_enabled", label: "Second reminder on", kind: "bool" },
  { column: "reminder_second_hours", label: "Second reminder (hours before)", kind: "int", min: 1, max: 24 },
  // Staff edit windows
  { column: "staff_edit_cutoff_hours", label: "Office staff edit cutoff (hours)", kind: "int", min: 0, max: 168 },
  { column: "return_edit_cutoff_hours", label: "Return-trip edit cutoff (hours)", kind: "int", min: 0, max: 48 },
  // Discounts
  { column: "military_discount_enabled", label: "Military Discount on", kind: "bool" },
  { column: "military_discount_amount_cents", label: "Military Discount amount", kind: "money", min: 1, max: 100 },
  { column: "discount_code_valid_days", label: "Discount codes last (days)", kind: "int", min: 1, max: 365 },
  // Business info
  { column: "business_phone", label: "Phone number", kind: "phone", maxLength: 30 },
  { column: "business_email", label: "Email address", kind: "email", maxLength: 120 },
  { column: "business_street", label: "Street address", kind: "text", maxLength: 120 },
  { column: "business_city_line", label: "City, state & ZIP", kind: "text", maxLength: 80 },
  { column: "business_hours", label: "Business hours", kind: "text", maxLength: 80 },
  // Reviews
  { column: "review_requests_enabled", label: "Review request emails on", kind: "bool" },
  { column: "google_review_url", label: "Google review link", kind: "url", maxLength: 300 },
  // Flight matching (existing)
  { column: "depart_min_buffer_minutes", label: "Flying out: at least (min before flight)", kind: "int", min: 0, max: 720 },
  { column: "depart_max_buffer_minutes", label: "Flying out: at most (min before flight)", kind: "int", min: 0, max: 720 },
  { column: "arrive_min_wait_minutes", label: "Landing: at least (min after landing)", kind: "int", min: 0, max: 720 },
  { column: "arrive_max_wait_minutes", label: "Landing: at most (min after landing)", kind: "int", min: 0, max: 720 },
];

export const FIELD_BY_COLUMN = new Map(SETTINGS_FIELDS.map((f) => [f.column, f]));

/** How a stored value reads in the change history. */
export function displayValue(f: FieldDef, v: unknown): string {
  if (v == null || v === "") return "(blank)";
  if (f.kind === "money") return `$${(Number(v) / 100).toFixed(2)}`;
  if (f.kind === "bool") return v ? "on" : "off";
  return String(v);
}

/**
 * Validate one submitted value (money arrives in dollars) and return the value
 * to store (money → cents), or an error message.
 */
export function parseField(f: FieldDef, raw: unknown): { value: unknown } | { error: string } {
  switch (f.kind) {
    case "bool":
      if (typeof raw !== "boolean") return { error: `${f.label}: choose on or off.` };
      return { value: raw };
    case "money": {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < (f.min ?? 0) || n > (f.max ?? 100000)) {
        return { error: `${f.label} must be between $${f.min ?? 0} and $${f.max}.` };
      }
      return { value: Math.round(n * 100) };
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 1e9)) {
        return { error: `${f.label} must be a whole number between ${f.min} and ${f.max}.` };
      }
      return { value: n };
    }
    case "email": {
      const v = String(raw ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > (f.maxLength ?? 200)) return { error: `${f.label} isn't a valid email address.` };
      return { value: v };
    }
    case "url": {
      const v = String(raw ?? "").trim();
      if (!v) return { value: null };
      if (!/^https:\/\/\S+$/.test(v) || v.length > (f.maxLength ?? 300)) return { error: `${f.label} must be a full link starting with https://` };
      return { value: v };
    }
    case "phone": {
      const v = String(raw ?? "").trim();
      const digits = v.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11 || v.length > (f.maxLength ?? 30)) return { error: `${f.label} must be a 10-digit phone number.` };
      return { value: v };
    }
    default: {
      const v = String(raw ?? "").trim();
      if (!v) return { error: `${f.label} can't be blank.` };
      if (v.length > (f.maxLength ?? 200)) return { error: `${f.label} is too long.` };
      return { value: v };
    }
  }
}

/** Cross-field rules, checked on the merged (current + changed) settings. */
export function crossFieldError(s: Record<string, unknown>): string | null {
  const n = (k: string) => Number(s[k]);
  if (n("depart_max_buffer_minutes") <= n("depart_min_buffer_minutes")) return "For departing flights, the latest arrival must be more than the earliest.";
  if (n("arrive_max_wait_minutes") <= n("arrive_min_wait_minutes")) return "For arriving flights, the longest wait must be more than the shortest.";
  if (s.reminder_first_enabled && s.reminder_second_enabled && n("reminder_second_hours") >= n("reminder_first_hours")) {
    return "The second reminder must be closer to departure than the first.";
  }
  return null;
}
