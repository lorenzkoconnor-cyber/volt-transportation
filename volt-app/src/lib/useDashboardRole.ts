"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { EmployeeRole } from "@/lib/supabase/types";

// Keep in sync with the dashboard layout's dev-preview switch.
const DEV_PREVIEW_ENABLED = process.env.NODE_ENV === "development";

/**
 * The role the dashboard UI should render for.
 *
 * In dev preview mode (`?preview=true`, development only) there is no signed-in
 * employee, but the layout impersonates an owner — so pages must too, otherwise
 * the preview shows a degraded, role-restricted view. In every real session
 * this is simply the signed-in employee's role.
 *
 * Use this (not `employee?.role`) for any role-gated UI on dashboard pages, so
 * access checks and financial visibility stay consistent with the layout.
 */
export function useDashboardRole(): EmployeeRole | undefined {
  const { employee } = useAuth();
  const params = useSearchParams();
  const isPreview = DEV_PREVIEW_ENABLED && params.get("preview") === "true";
  return isPreview ? "owner" : employee?.role;
}
