// ─── One-time discount codes — shared by checkout UI and server ────────────────
// Created by an owner/manager (Dashboard → Discount Codes) for a customer who
// needs more than the standard discount. Each code is single-use and expires
// DISCOUNT_CODE_DAYS after it's created. Only one discount applies per
// booking: a code replaces the Military Discount.

import { money } from "@/lib/booking";

export const DISCOUNT_CODE_DAYS = 3;

export type DiscountCodeType = "percent" | "fixed";

export interface DiscountCodeTerms {
  type: DiscountCodeType;
  value: number;  // percent: 1–100 · fixed: cents
}

// Auto-generated codes are 8 characters without look-alikes (no 0/O, 1/I/L).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

// Owners/managers may type their own code instead (letters and numbers only).
export const CUSTOM_CODE_MIN = 6;
export const CUSTOM_CODE_MAX = 20;

// Returns the normalized custom code, or an error message.
export function checkCustomCode(input: string): { ok: true; code: string } | { ok: false; error: string } {
  if (/[^A-Za-z0-9\s-]/.test(input)) {
    return { ok: false, error: "Custom codes can only use letters and numbers." };
  }
  const code = normalizeCode(input);
  if (code.length < CUSTOM_CODE_MIN || code.length > CUSTOM_CODE_MAX) {
    return { ok: false, error: `Custom codes must be ${CUSTOM_CODE_MIN}–${CUSTOM_CODE_MAX} letters or numbers.` };
  }
  return { ok: true, code };
}

// Riders may type "k7mp-q2xr" or "K7MP Q2XR" — compare on the bare characters.
export function normalizeCode(input: string): string {
  return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Codes are stored and shown in their normalized form (e.g. "K7MPQ2XR", "SMITH50").
export function formatCode(code: string): string {
  return code;
}

export function codeLabel(t: DiscountCodeTerms): string {
  return t.type === "percent" ? `${t.value}% off` : `$${money(t.value / 100)} off`;
}

// Cents taken off `subtotalCents`. Anything that would leave less than Stripe's
// $0.50 minimum charge makes the booking free instead.
export function codeDiscountCents(subtotalCents: number, t: DiscountCodeTerms): number {
  const raw = t.type === "percent"
    ? Math.round((subtotalCents * t.value) / 100)
    : Math.min(t.value, subtotalCents);
  return subtotalCents - raw < 50 ? subtotalCents : raw;
}

export type CodeState = "active" | "used" | "expired" | "revoked";

export function codeState(row: { used_at: string | null; revoked_at: string | null; expires_at: string }): CodeState {
  if (row.used_at) return "used";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

// What the rider sees when a code can't be used.
export const CODE_ERRORS: Record<Exclude<CodeState, "active"> | "invalid" | "busy", string> = {
  invalid: "That code isn't valid. Check it and try again.",
  used: "That code has already been used. Each code works only once — please ask Volt for a new one.",
  expired: `That code has expired (codes last ${DISCOUNT_CODE_DAYS} days). Please ask Volt for a new one.`,
  revoked: "That code is no longer valid. Please ask Volt for a new one.",
  busy: "That code is being used in another checkout right now. Try again in a few minutes.",
};
