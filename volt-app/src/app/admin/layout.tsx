"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { canAccessAdminRoute } from "@/lib/permissions";
import { Loader2, AlertTriangle, Menu, Zap, ShieldAlert } from "lucide-react";

// Dev preview mode — lets you see the dashboard without Supabase connected.
// Access via: /admin?preview=true
// Remove this entire block when Supabase is connected and you're using real auth.
const DEV_PREVIEW_ENABLED = process.env.NODE_ENV === "development";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { isEmployee, employee, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const isPreview = DEV_PREVIEW_ENABLED && params.get("preview") === "true";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isPreview && !loading && !isEmployee) {
      router.replace("/emp-login");
    }
  }, [isEmployee, loading, router, isPreview]);

  // Block regular employees from restricted areas (revenue, reports, payments,
  // vehicles, drivers, employees) if they navigate there directly by URL.
  const routeAllowed =
    isPreview || !employee || canAccessAdminRoute(pathname, employee.role);

  // Prevent background scroll while the mobile sidebar is open.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  if (!isPreview && loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
          <p className="text-[#A1A1AA] text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!isPreview && !isEmployee) return null;

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <AdminSidebar
        previewMode={isPreview}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 min-h-screen lg:ml-64">
        {/* Mobile top bar with hamburger toggle */}
        <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-[#0F0F0F]/95 backdrop-blur-xl border-b border-white/6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-white hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#7C3AED] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" fill="white" />
            </div>
            <span className="text-white font-semibold text-sm">Volt Operations</span>
          </div>
        </div>

        {/* Dev preview banner */}
        {isPreview && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2.5">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-yellow-400 text-xs">
              <span className="font-semibold">Preview Mode</span> — You&apos;re viewing the dashboard UI without auth.
              Connect Supabase and sign in as Owner to use real data.
            </p>
          </div>
        )}
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
          {routeAllowed ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <ShieldAlert className="w-7 h-7 text-red-400" />
              </div>
              <div>
                <h1 className="text-white text-xl font-bold mb-1">Access restricted</h1>
                <p className="text-[#A1A1AA] text-sm max-w-sm">
                  This area is limited to managers and owners. If you need access,
                  contact your manager.
                </p>
              </div>
              <button
                onClick={() => router.replace("/admin")}
                className="mt-2 px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#9D5FF5] text-white text-sm font-semibold transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    }>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}
