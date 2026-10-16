import { NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { easternToday } from "@/lib/format";

// GET /api/health — for the uptime monitor (UptimeRobot). Returns 200 when the
// site can reach the database and has departures scheduled for the coming
// week, 503 otherwise (e.g. the Supabase project paused itself). Reveals
// nothing beyond ok / not ok.
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = { database: "fail", schedule: "fail" };
  try {
    const sb = createAdminDb();
    const today = easternToday();
    const weekOut = easternToday(new Date(Date.now() + 7 * 86_400_000));
    const { count, error } = await sb
      .from("trips")
      .select("id", { count: "exact", head: true })
      .gte("departure_date", today)
      .lte("departure_date", weekOut)
      .eq("status", "scheduled");
    if (!error) {
      checks.database = "ok";
      if ((count ?? 0) > 0) checks.schedule = "ok";
    }
  } catch (err) {
    console.error("[health]", err);
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { ok, checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
