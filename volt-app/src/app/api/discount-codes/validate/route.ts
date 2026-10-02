import { NextRequest, NextResponse } from "next/server";
import { codeTerms, createAdminDb, lookupDiscountCode } from "@/lib/checkout";
import { formatCode } from "@/lib/discount-codes";
import { rateLimit, breakerTripped, recordFailure, DISCOUNT_BREAKER, DISCOUNT_PAUSED_ERROR } from "@/lib/rate-limit";

// POST /api/discount-codes/validate  { code }
// Checkout's "Apply" button. Only checks the code — it is held and spent when
// the rider actually pays (see /api/payments/create-intent).
// 200 → { code, type, value, expiresAt } · 400 → { error }
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "discount-validate", 10, 15 * 60_000);
  if (limited) return limited;

  try {
    const { name, limit, windowMs } = DISCOUNT_BREAKER;
    if (breakerTripped(name, limit, windowMs)) {
      return NextResponse.json({ error: DISCOUNT_PAUSED_ERROR }, { status: 429 });
    }
    const { code } = await request.json().catch(() => ({}));
    const found = await lookupDiscountCode(createAdminDb(), String(code ?? ""));
    if (!found.ok) {
      recordFailure(name, windowMs);
      return NextResponse.json({ error: found.error }, { status: 400 });
    }
    return NextResponse.json({
      code: formatCode(found.row.code),
      ...codeTerms(found.row),
      expiresAt: found.row.expires_at,
    });
  } catch (err) {
    console.error("[discount-codes/validate]", err);
    return NextResponse.json({ error: "Could not check that code. Please try again." }, { status: 500 });
  }
}
