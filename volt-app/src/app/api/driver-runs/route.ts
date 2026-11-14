import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { driverForEmployee, loadOpsSettings, loadRuns, shiftStartedAt } from "@/lib/driver-runs-server";
import { ALL_STAFF } from "@/lib/driver-runs-auth";
import { easternToday } from "@/lib/format";

// GET /api/driver-runs[?date=YYYY-MM-DD]
//   Driver: their own runs today (My Trips), plus their shift start.
//   Office: every run that day (Dispatch live board).
export async function GET(request: NextRequest) {
  const ctx = await requireStaff(ALL_STAFF);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const raw = request.nextUrl.searchParams.get("date") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : easternToday();
    const settings = await loadOpsSettings(ctx.sb);
    const isDriver = ctx.employee.role === "driver";
    const driver = await driverForEmployee(ctx.sb, ctx.employee.id);

    if (isDriver && !driver) {
      return NextResponse.json({
        runs: [], settings, role: ctx.employee.role, me: null,
        notLinked: "Your login isn't connected to a driver profile yet. Ask the owner or a manager to link it on the Drivers page.",
      });
    }
    const runs = await loadRuns(ctx.sb, { date, driverId: isDriver ? driver.id : undefined });
    const me = driver ? {
      driverId: driver.id,
      firstName: driver.first_name,
      photoUrl: driver.photo_url ?? null,
      shiftStartedAt: await shiftStartedAt(ctx.sb, driver.id),
    } : null;

    // Office: shift start for each driver on the board (hours warning).
    let shifts: Record<string, string | null> = {};
    if (!isDriver) {
      const ids = [...new Set(runs.map((r) => r.driver?.id).filter(Boolean))] as string[];
      shifts = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await shiftStartedAt(ctx.sb, id)])));
    }
    return NextResponse.json({ runs, settings, role: ctx.employee.role, me, shifts });
  } catch (err) {
    console.error("[driver-runs] load", err);
    return NextResponse.json({ error: "Couldn't load trips." }, { status: 500 });
  }
}
