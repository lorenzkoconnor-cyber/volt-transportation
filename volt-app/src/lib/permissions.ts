// ─── Volt Transportation — Role-Based Access Control ─────────────────────────
// Single source of truth for which employee roles may reach which admin areas.
// Used by the sidebar (to hide links), the admin layout (to block direct URL
// navigation), and individual pages (to hide sensitive data like revenue).

import type { EmployeeRole } from "@/lib/supabase/types";

export const ALL_ROLES: EmployeeRole[] = ["owner", "manager", "office_staff", "driver"];

// Roles allowed to see financial information: revenue, payment totals, reports.
// "Regular" employees (office staff, drivers) are intentionally excluded.
export const FINANCE_ROLES: EmployeeRole[] = ["owner", "manager"];

export function canViewFinancials(role: EmployeeRole | null | undefined): boolean {
  return !!role && FINANCE_ROLES.includes(role);
}

// Admin route → roles permitted to access it. Ordered most-specific first so
// nested routes (e.g. /admin/reservations/new) resolve before their parents.
export interface RouteAccess {
  prefix: string;
  roles: EmployeeRole[];
}

export const ADMIN_ROUTE_ACCESS: RouteAccess[] = [
  { prefix: "/admin/reservations", roles: ["owner", "manager", "office_staff"] },
  { prefix: "/admin/dispatch",     roles: ["owner", "manager", "office_staff", "driver"] },
  { prefix: "/admin/manifest",     roles: ["owner", "manager", "office_staff", "driver"] },
  { prefix: "/admin/vehicles",     roles: ["owner", "manager"] },
  { prefix: "/admin/drivers",      roles: ["owner", "manager"] },
  { prefix: "/admin/payments",     roles: FINANCE_ROLES },
  { prefix: "/admin/reports",      roles: FINANCE_ROLES },
  { prefix: "/admin/employees",    roles: ["owner"] },
  { prefix: "/admin",              roles: ALL_ROLES }, // dashboard — keep last (least specific)
];

// Resolve the roles allowed for a given pathname using longest-prefix match.
export function rolesForRoute(pathname: string): EmployeeRole[] {
  const match = ADMIN_ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );
  return match ? match.roles : ALL_ROLES;
}

export function canAccessAdminRoute(
  pathname: string,
  role: EmployeeRole | null | undefined
): boolean {
  return !!role && rolesForRoute(pathname).includes(role);
}
