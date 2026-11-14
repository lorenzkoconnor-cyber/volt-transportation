import { NextRequest, NextResponse } from "next/server";
import { applyRunAction } from "@/lib/driver-runs-server";
import { requireRunAccess } from "@/lib/driver-runs-auth";

// POST /api/driver-runs/<trip_vehicles id>
//   { kind, terminal?, reservationId?, note?, clientId?, at? }
// Saves one tap from My Trips (or an office override from Dispatch). A tap
// retried with the same clientId (offline queue) is only saved once.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireRunAccess(id);
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => ({}));
  const result = await applyRunAction(access.ctx.sb, access.run, access.action, {
    kind: String(body.kind ?? ""),
    terminal: body.terminal ?? null,
    reservationId: body.reservationId ?? null,
    note: body.note ?? null,
    clientId: body.clientId ?? null,
    at: body.at ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  return NextResponse.json(result);
}
