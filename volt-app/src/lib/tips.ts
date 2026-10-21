// ─── Tips (pure — shared by the browser and the server) ──────────────────────
// Riders can tip at online checkout, on the ride-along page, or after the trip
// (/tip/<token>); staff can add one when booking. A tip is part of the
// reservation total (reservations.tip_cents), so refunds and receipts include it.

export const TIP_PRESETS_CENTS = [500, 1000, 2000];
export const MAX_TIP_CENTS = 50_000;
// Stripe's smallest card charge — a tip paid on its own can't be less.
export const MIN_SEPARATE_TIP_CENTS = 100;

/** Whole cents between 0 and MAX_TIP_CENTS; anything else is 0. */
export function normalizeTipCents(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_TIP_CENTS);
}

/** "12.50" typed into the custom box → cents (0 when blank or invalid). */
export function tipFromDollars(text: string): number {
  return normalizeTipCents(Math.round((parseFloat(text) || 0) * 100));
}
