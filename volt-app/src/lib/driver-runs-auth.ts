// ─── Who may work a run (server-only) ─────────────────────────────────────────
// Drivers act only on runs they're assigned to; owners, managers and office
// staff can act on any run (office override on Dispatch).

import { NextResponse } from "next/server";
import { requireStaff, type StaffContext } from "@/lib/staff-booking";
import { driverForEmployee, loadRuns, UUID_RE, type RunPayload, type ActionContext } from "@/lib/driver-runs-server";

export const ALL_STAFF = ["owner", "manager", "office_staff", "driver"];
export const OFFICE = ["owner", "manager", "office_staff"];

export interface RunAccess {
  ctx: StaffContext;
  run: RunPayload;
  driver: { id: string; phone: string | null } | null; // the signed-in driver (drivers only)
  action: ActionContext;
}

export async function requireRunAccess(tripVehicleId: string): Promise<RunAccess | NextResponse> {
  const ctx = await requireStaff(ALL_STAFF);
  if (ctx instanceof NextResponse) return ctx;
  if (!UUID_RE.test(tripVehicleId)) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  const [run] = await loadRuns(ctx.sb, { tripVehicleIds: [tripVehicleId] });
  if (!run) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  if (ctx.employee.role === "driver") {
    const driver = await driverForEmployee(ctx.sb, ctx.employee.id);
    if (!driver || run.driver?.id !== driver.id) {
      return NextResponse.json({ error: "This trip isn't assigned to you. Ask the office." }, { status: 403 });
    }
    return { ctx, run, driver: { id: driver.id, phone: driver.phone }, action: { actor: "driver", employeeId: ctx.employee.id, employeeName: ctx.employee.name } };
  }
  return { ctx, run, driver: null, action: { actor: "office", employeeId: ctx.employee.id, employeeName: ctx.employee.name } };
}
