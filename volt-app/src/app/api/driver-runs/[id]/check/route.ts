import { NextRequest, NextResponse } from "next/server";
import { requireRunAccess } from "@/lib/driver-runs-auth";
import { CHECK_ITEMS, FUEL_LEVELS } from "@/lib/driver-run";
import { raiseStaffAlert } from "@/lib/notifications/alerts";

// POST /api/driver-runs/<trip_vehicles id>/check
//   { items: { tires: true, … }, mileage, fuel, notes, kind?: "pre_trip" | "post_trip" }
// The van check before the driver's first trip in that van today (and the
// mileage / fuel when they're back at Volt). A failed item alerts the office.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireRunAccess(id);
  if (access instanceof NextResponse) return access;
  const { run } = access;
  if (!run.vehicle) return NextResponse.json({ error: "No van is assigned to this trip." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "post_trip" ? "post_trip" : "pre_trip";
  const items: Record<string, boolean | string> = { kind };
  for (const it of CHECK_ITEMS) items[it.key] = body.items?.[it.key] === true;
  const mileage = body.mileage === "" || body.mileage == null ? null : Number(body.mileage);
  if (mileage !== null && (!Number.isInteger(mileage) || mileage < 0 || mileage > 2_000_000)) {
    return NextResponse.json({ error: "Mileage should be the whole number on the odometer." }, { status: 400 });
  }
  const fuel = FUEL_LEVELS.includes(body.fuel) ? body.fuel : null;
  if (!fuel) return NextResponse.json({ error: "Pick the fuel level." }, { status: 400 });
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null;

  const { error } = await access.ctx.sb.from("vehicle_checks").insert({
    vehicle_id: run.vehicle.id,
    driver_id: run.driver?.id ?? null,
    trip_vehicle_id: run.tripVehicleId,
    items, mileage, fuel_level: fuel, notes,
  });
  if (error) {
    console.error("[driver-runs] check", error);
    return NextResponse.json({ error: "Couldn't save the check. Try again." }, { status: 500 });
  }

  const failed = kind === "pre_trip" ? CHECK_ITEMS.filter((it) => !items[it.key]).map((it) => it.label) : [];
  if (failed.length || fuel === "low" || (notes && kind === "pre_trip")) {
    await raiseStaffAlert(access.ctx.sb, "driver_run", {
      key: `check:${run.tripVehicleId}:${Date.now()}`,
      subject: `Van check: ${run.vehicle.name} needs a look`,
      text: `${run.driver?.name ?? access.ctx.employee.name} checked ${run.vehicle.name} before the ${run.trip.routeName} trip.` +
        (failed.length ? `\nNot OK: ${failed.join(", ")}` : "") +
        (fuel === "low" ? "\nFuel is low." : "") +
        (notes ? `\nNotes: ${notes}` : ""),
      link: "/dashboard/dispatch",
    });
  }
  return NextResponse.json({ ok: true });
}
