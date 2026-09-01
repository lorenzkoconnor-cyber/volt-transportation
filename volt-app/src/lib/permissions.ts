// ─── Role-based access control ───────────────────────────────────────────────
// Single source of truth for which employee roles may reach each dashboard route
// and who may see financial figures. Mirrors the role matrix in
// VOLT_PROJECT_REQUIREMENTS.md (Employee Roles) so the UI and the guards can't
// drift apart. Enforced in the dashboard layout, the sidebar, and quick actions.

import type { EmployeeRole } from "@/lib/supabase/types";

export const ALL_ROLES: EmployeeRole[] = ["owner", "manager", "office_staff", "driver"];

// Route → roles allowed to open it. Ordered most-specific-prefix first so the
// first match wins (see canAccessRoute). Every dashboard path should be covered
// by an entry here; anything unmatched is denied by default.
const ROUTE_ACCESS: { prefix: string; roles: EmployeeRole[] }[] = [
  { prefix: "/dashboard/reservations", roles: ["owner", "manager", "office_staff"] },
  { prefix: "/dashboard/dispatch",     roles: ["owner", "manager", "office_staff", "driver"] },
  { prefix: "/dashboard/manifest",     roles: ["owner", "manager", "office_staff", "driver"] },
  { prefix: "/dashboard/vehicles",     roles: ["owner", "manager"] },
  { prefix: "/dashboard/drivers",      roles: ["owner", "manager"] },
  { prefix: "/dashboard/payments",     roles: ["owner", "manager"] },
  { prefix: "/dashboard/reports",      roles: ["owner", "manager"] },
  { prefix: "/dashboard/employees",    roles: ["owner"] },
  { prefix: "/dashboard",              roles: ["owner", "manager", "office_staff", "driver"] },
];

/** True if `role` may open `path`. Unmatched paths are denied. */
export function canAccessRoute(path: string, role: EmployeeRole | null | undefined): boolean {
  if (!role) return false;
  const match = ROUTE_ACCESS.find(
    (r) => path === r.prefix || path.startsWith(r.prefix + "/")
  );
  return match ? match.roles.includes(role) : false;
}

/**
 * True if `role` may see company money — revenue, earnings, reservation totals,
 * payment amounts. Only owners and managers can. Office staff and drivers cannot
 * (per the owner's directive). Note: office staff still see prices *inside the
 * take-payment flow* (New Reservation) so they can collect the correct amount —
 * that page opts in explicitly and does not use this flag.
 */
export function canViewFinancials(role: EmployeeRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}
