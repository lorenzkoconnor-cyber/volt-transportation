// ─── Cash taken at the counter ────────────────────────────────────────────────
// Staff type in what the customer handed over, so change is worked out on
// screen and cash is never marked paid by one accidental tap. Pure.

import { formatCents } from "@/lib/format";

/** Payment note: "Cash received $60.00 · change $5.00". */
export function cashReceivedNote(receivedCents: number, dueCents: number): string {
  return `Cash received ${formatCents(receivedCents)} · change ${formatCents(Math.max(0, receivedCents - dueCents))}`;
}

/** Error when cash is being marked paid without enough typed in as received. */
export function cashReceivedError(receivedCents: number, dueCents: number): string | null {
  if (!(receivedCents > 0)) return `Enter how much cash the customer handed over (at least ${formatCents(dueCents)}).`;
  if (receivedCents < dueCents) return `Cash received (${formatCents(receivedCents)}) is less than the ${formatCents(dueCents)} due.`;
  return null;
}
