import { NextRequest, NextResponse } from "next/server";
import { loadTrack, saveTrackMessage, saveTrackUpdate } from "@/lib/track-server";
import { rateLimit } from "@/lib/rate-limit";

// GET  /api/track/<token>  — the tracking page polls this every ~15 seconds.
// POST /api/track/<token>  { status?, delayMinutes?, newLandingTime?, terminal? }
//   The rider tells the driver: outside / at baggage / flight delayed /
//   different terminal / can't make it ("clear" undoes a status).
// POST /api/track/<token>  { message }  — a short note to the driver.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, "track-get", 240, 10 * 60_000);
  if (limited) return limited;
  const { token } = await params;
  const page = await loadTrack(token);
  if (!page) return NextResponse.json({ error: "This tracking link isn't valid." }, { status: 404 });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, "track-post", 30, 10 * 60_000);
  if (limited) return limited;
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const r = "message" in body ? await saveTrackMessage(token, body.message) : await saveTrackUpdate(token, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, page: await loadTrack(token) });
}
