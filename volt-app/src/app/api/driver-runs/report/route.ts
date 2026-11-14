import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { loadRuns } from "@/lib/driver-runs-server";
import { runSchedule } from "@/lib/driver-run";

// GET /api/driver-runs/report?days=30 — on-time report for Reports (owners/managers).
// Worked out from the drivers' taps:
//   left on time   — "On the way" / "Leaving Volt" within 10 min of the scheduled time
//   at ATL on time — ATL → Columbus: first "Arrived" within 10 min of pickup time
//   curb wait      — ATL pickups: minutes from "Arrived" to "Done" at each stop
const LATE_MIN = 10;

export async function GET(request: NextRequest) {
  const ctx = await requireStaff(["owner", "manager"]);
  if (ctx instanceof NextResponse) return ctx;
  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: ev } = await ctx.sb.from("trip_run_events").select("trip_vehicle_id").eq("kind", "left_volt").gte("happened_at", since);
  const ids = [...new Set((ev ?? []).map((e: { trip_vehicle_id: string }) => e.trip_vehicle_id))] as string[];
  const runs = ids.length ? await loadRuns(ctx.sb, { tripVehicleIds: ids }) : [];

  type Agg = { name: string; runs: number; leftOnTime: number; atlRuns: number; atlOnTime: number; waits: number[]; noShows: number };
  const blank = (name: string): Agg => ({ name, runs: 0, leftOnTime: 0, atlRuns: 0, atlOnTime: 0, waits: [], noShows: 0 });
  const total = blank("All drivers");
  const byDriver = new Map<string, Agg>();
  const t = (iso: string) => new Date(iso).getTime();

  for (const run of runs) {
    const sch = runSchedule(run.trip);
    const left = run.events.find((e) => e.kind === "left_volt");
    if (!left) continue;
    const key = run.driver?.id ?? "none";
    if (!byDriver.has(key)) byDriver.set(key, blank(run.driver?.name ?? "No driver"));
    const aggs = [total, byDriver.get(key)!];
    const leftOk = t(left.at) <= t(sch.leaveVolt) + LATE_MIN * 60_000;
    const firstArrival = run.events.filter((e) => e.kind === "arrived_stop").sort((a, b) => t(a.at) - t(b.at))[0];
    const waits: number[] = [];
    for (const a of run.events.filter((e) => e.kind === "arrived_stop")) {
      const d = run.events.find((e) => e.kind === "stop_done" && e.terminal === a.terminal && t(e.at) >= t(a.at));
      if (d) waits.push((t(d.at) - t(a.at)) / 60_000);
    }
    const noShows = run.events.filter((e) => e.kind === "no_show").length;
    for (const g of aggs) {
      g.runs++;
      if (leftOk) g.leftOnTime++;
      if (run.trip.kind === "from_atl" && firstArrival) {
        g.atlRuns++;
        if (t(firstArrival.at) <= t(sch.atAtl) + LATE_MIN * 60_000) g.atlOnTime++;
      }
      g.waits.push(...waits);
      g.noShows += noShows;
    }
  }

  const shape = (g: Agg) => ({
    name: g.name, runs: g.runs,
    leftOnTimePct: g.runs ? Math.round((g.leftOnTime / g.runs) * 100) : null,
    atlOnTimePct: g.atlRuns ? Math.round((g.atlOnTime / g.atlRuns) * 100) : null,
    avgCurbWait: g.waits.length ? Math.round(g.waits.reduce((s, x) => s + x, 0) / g.waits.length) : null,
    noShows: g.noShows,
  });
  return NextResponse.json({
    days,
    total: shape(total),
    drivers: [...byDriver.values()].map(shape).sort((a, b) => b.runs - a.runs),
  });
}
