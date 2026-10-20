import { NextRequest, NextResponse } from "next/server";
import { requireStaff, type StaffContext } from "@/lib/staff-booking";
import { createDeviceCode, getDeviceCode, isSquareConfigured, squareEnvironment } from "@/lib/square/server";

// Dashboard → Settings → Payments: the Square Terminals staff can send to.
// Owners and managers only.
//
//   GET                                     → { devices, configured, environment }
//   POST { action: "pair_start", name }     → { codeId, code } — type the code on the Terminal
//   POST { action: "pair_check", codeId, name } → { paired } — saves the Terminal once paired
//   POST { action: "add", name, deviceId }  → adds a device id directly (sandbox test devices)
//   POST { action: "rename", id, name }
//   POST { action: "remove", id }

async function requireOwnerOrManager(): Promise<StaffContext | NextResponse> {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  if (!["owner", "manager"].includes(ctx.employee.role)) {
    return NextResponse.json({ error: "Only owners and managers can manage Terminals." }, { status: 403 });
  }
  return ctx;
}

const cleanName = (v: unknown) => String(v ?? "").trim().slice(0, 60);

export async function GET() {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { data } = await ctx.sb.from("square_devices").select("id, name, device_id, is_active, created_at")
    .eq("is_active", true).order("created_at");
  return NextResponse.json({ devices: data ?? [], configured: isSquareConfigured(), environment: squareEnvironment() });
}

export async function POST(request: NextRequest) {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  try {
    const body = await request.json();
    const name = cleanName(body?.name);

    switch (body?.action) {
      case "pair_start": {
        if (!isSquareConfigured()) return NextResponse.json({ error: "Add the Square keys first (see SQUARE_TERMINAL_PLAN.md)." }, { status: 400 });
        if (!name) return NextResponse.json({ error: "Name the Terminal (e.g. Front counter)." }, { status: 400 });
        const code = await createDeviceCode(name);
        return NextResponse.json({ codeId: code.id, code: code.code, expiresAt: code.expiresAt });
      }
      case "pair_check": {
        const codeId = String(body?.codeId ?? "");
        if (!codeId || !name) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        const state = await getDeviceCode(codeId);
        if (state.status !== "PAIRED" || !state.deviceId) return NextResponse.json({ paired: false, status: state.status });
        const { error } = await sb.from("square_devices")
          .upsert({ name, device_id: state.deviceId, device_code_id: codeId, is_active: true }, { onConflict: "device_id" });
        if (error) throw error;
        return NextResponse.json({ paired: true });
      }
      case "add": {
        const deviceId = String(body?.deviceId ?? "").trim().slice(0, 100);
        if (!name || !deviceId) return NextResponse.json({ error: "Enter a name and a device ID." }, { status: 400 });
        const { error } = await sb.from("square_devices")
          .upsert({ name, device_id: deviceId, is_active: true }, { onConflict: "device_id" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "rename": {
        if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
        await sb.from("square_devices").update({ name }).eq("id", String(body?.id ?? ""));
        return NextResponse.json({ ok: true });
      }
      case "remove": {
        await sb.from("square_devices").update({ is_active: false }).eq("id", String(body?.id ?? ""));
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
  } catch (err) {
    console.error("[square-devices]", err);
    const message = err instanceof Error ? err.message : "Square request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
