import { NextRequest, NextResponse } from "next/server";

// ─── Rate limiting ────────────────────────────────────────────────────────────
// In-memory fixed window per IP. The site runs as a single Node process on
// Hostinger, so this is enough to stop scripted guessing (confirmation numbers,
// discount codes) and upload spam. Resets on redeploy, which is fine.
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Returns a 429 response when the caller is over the limit, otherwise null.
export function rateLimit(
  request: NextRequest,
  name: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }

  const key = `${name}:${clientIp(request)}`;
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count++;
  if (entry.count <= limit) return null;

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return NextResponse.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

// ─── Site-wide failure breaker ────────────────────────────────────────────────
// Per-IP limits don't stop an attacker who spreads guesses across many IPs.
// This counts wrong answers from EVERYONE: past `limit` failures in the window,
// checking pauses for all callers until older failures age out.
const failures = new Map<string, number[]>();

function recentFailures(name: string, windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  const list = (failures.get(name) ?? []).filter((t) => t > cutoff);
  failures.set(name, list);
  return list;
}

export function breakerTripped(name: string, limit: number, windowMs: number): boolean {
  return recentFailures(name, windowMs).length >= limit;
}

export function recordFailure(name: string, windowMs: number): void {
  recentFailures(name, windowMs).push(Date.now());
}

// Wrong discount codes, site-wide: 50 per hour.
export const DISCOUNT_BREAKER = { name: "discount-code", limit: 50, windowMs: 60 * 60_000 } as const;
export const DISCOUNT_PAUSED_ERROR =
  "Discount codes are temporarily unavailable. Please try again later, or call us for help.";
