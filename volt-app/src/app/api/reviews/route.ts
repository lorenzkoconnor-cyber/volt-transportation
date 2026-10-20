import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { recordGoogleClick, submitReview } from "@/lib/reviews-server";

// POST /api/reviews — the /review/<token> page.
//   { token, rating, body, displayName } → saves the review (published, or held
//                                          if it has links/contact details/profanity)
//   { token, action: "google" }          → the customer opened the Google review page
export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "reviews", 10, 15 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token ?? "");
    if (body?.action === "google") {
      await recordGoogleClick(token);
      return NextResponse.json({ ok: true });
    }
    const result = await submitReview(token, body ?? {});
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/reviews]", err);
    return NextResponse.json({ error: "Could not save your review. Please try again." }, { status: 500 });
  }
}
