import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { closeRideAlong, createRideAlong, rideAlongStatus, rideAlongTrips } from "@/lib/ride-along";

// Team Portal → Ride-Along (owners, managers, office staff and drivers).
//   GET                         → { trips } that can take a ride-along now
//   GET ?id=<session>           → the open QR: link, expiry, parties paid so far
//   POST { action: "create", tripId } → a new QR for that trip
//   POST { action: "close", id }      → stop the QR from taking payments
const ROLES = ["owner", "manager", "office_staff", "driver"];

export async function GET(request: NextRequest) {
  const ctx = await requireStaff(ROLES);
  if (ctx instanceof NextResponse) return ctx;
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const status = await rideAlongStatus(ctx.sb, id);
    if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(status);
  }
  return NextResponse.json({ trips: await rideAlongTrips(ctx.sb) });
}

export async function POST(request: NextRequest) {
  const ctx = await requireStaff(ROLES);
  if (ctx instanceof NextResponse) return ctx;
  const body = await request.json().catch(() => ({}));
  if (body?.action === "close") {
    await closeRideAlong(ctx.sb, String(body.id ?? ""));
    return NextResponse.json({ ok: true });
  }
  const res = await createRideAlong(ctx.sb, ctx.employee.id, String(body?.tripId ?? ""));
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
