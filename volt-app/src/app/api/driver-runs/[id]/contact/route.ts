import { NextRequest, NextResponse } from "next/server";
import { messageRider } from "@/lib/driver-runs-server";
import { DRIVER_QUICK_REPLIES } from "@/lib/driver-run";
import { requireRunAccess } from "@/lib/driver-runs-auth";
import { callThroughVolt } from "@/lib/notifications/sms";

// POST /api/driver-runs/<trip_vehicles id>/contact
//   { reservationId, mode: "call" }                 → rings the driver's phone, then connects the rider (Volt caller ID)
//   { reservationId, mode: "text", template | body } → a message on the rider's tracking page
//                                                      (also texted from Volt's number if they agreed to texts)
// Riders' and drivers' personal numbers are never shown to each other.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireRunAccess(id);
  if (access instanceof NextResponse) return access;
  const { reservationId, mode, template, body } = await request.json().catch(() => ({}));
  const rider = access.run.riders.find((r) => r.reservationId === reservationId);
  if (!rider) return NextResponse.json({ error: "That rider isn't on this trip." }, { status: 400 });

  if (mode === "text") {
    const message = template ? DRIVER_QUICK_REPLIES[template as keyof typeof DRIVER_QUICK_REPLIES] : typeof body === "string" ? body : "";
    if (!message) return NextResponse.json({ error: "Pick or type a message." }, { status: 400 });
    const r = await messageRider(access.ctx.sb, access.run, rider.reservationId, message, {
      sender: access.driver ? "driver" : "office", employeeId: access.ctx.employee.id,
    });
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (mode === "call") {
    // Office staff calling from the board ring their own phone on file.
    let myPhone = access.driver?.phone ?? null;
    if (!access.driver) {
      const { data } = await access.ctx.sb.from("employees").select("phone").eq("id", access.ctx.employee.id).maybeSingle();
      myPhone = data?.phone ?? null;
    }
    if (!myPhone) return NextResponse.json({ error: "There's no phone number on your profile to ring. Ask the office to add it." }, { status: 400 });
    const { data: res } = await access.ctx.sb.from("reservations").select("customer:customers(phone)").eq("id", rider.reservationId).maybeSingle();
    const riderPhone = res?.customer?.phone;
    if (!riderPhone) return NextResponse.json({ error: "No phone number on this booking. Call the office." }, { status: 400 });
    const r = await callThroughVolt(myPhone, riderPhone);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: `${r.error} Call the office instead.` }, { status: 502 });
  }
  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
