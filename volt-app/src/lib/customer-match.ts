// How we decide two bookings belong to the same rider: same email (ignoring
// capital letters and spaces) and same phone number (ignoring formatting).
// Pure helpers — no database — so they can be unit-tested.

/** Lowercase, trimmed email; "" when missing. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Digits only, with a leading US "1" dropped: "+1 (706) 573-3364" → "7065733364". */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** True when both contacts are the same rider. Blank phones never match. */
export function sameContact(
  a: { email: string | null; phone: string | null },
  b: { email: string | null; phone: string | null },
): boolean {
  const phone = normalizePhone(a.phone);
  return normalizeEmail(a.email) !== "" &&
    normalizeEmail(a.email) === normalizeEmail(b.email) &&
    phone !== "" && phone === normalizePhone(b.phone);
}

/** Escape a value for an exact (case-insensitive) PostgREST `ilike` match. */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
