import { NextRequest, NextResponse } from "next/server";
import { codeTerms, createAdminDb, lookupDiscountCode } from "@/lib/checkout";
import { formatCode } from "@/lib/discount-codes";

// POST /api/discount-codes/validate  { code }
// Checkout's "Apply" button. Only checks the code — it is held and spent when
// the rider actually pays (see /api/payments/create-intent).
// 200 → { code, type, value, expiresAt } · 400 → { error }
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json().catch(() => ({}));
    const found = await lookupDiscountCode(createAdminDb(), String(code ?? ""));
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: 400 });
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
