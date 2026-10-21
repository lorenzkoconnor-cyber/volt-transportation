import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { recordTip, startTip } from "@/lib/tips-server";

// POST /api/tips — the /tip/<token> page (a tip after the trip).
//   { action: "start", token, cents }            → { clientSecret, paymentIntentId, simulated }
//   { action: "record", paymentIntentId, token, cents } → records the paid tip
//     (token + cents are only used in local test mode, without Stripe keys).
// The Stripe webhook records it too, so a closed page still counts.
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "tips", 15, 15 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token ?? "");
    if (body?.action === "start") {
      const res = await startTip(token, body?.cents);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
      return NextResponse.json(res);
    }
    if (body?.action === "record") {
      const res = await recordTip(String(body?.paymentIntentId ?? ""), { token, cents: body?.cents });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
      return NextResponse.json(res);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("[api/tips]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
