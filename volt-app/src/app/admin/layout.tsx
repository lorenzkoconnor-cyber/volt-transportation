"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Loader2, AlertTriangle } from "lucide-react";

// Dev preview mode — lets you see the dashboard without Supabase connected.
// Access via: /admin?preview=true
// Remove this entire block when Supabase is connected and you're using real auth.
const DEV_PREVIEW_ENABLED = process.env.NODE_ENV === "development";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { isEmployee, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isPreview = DEV_PREVIEW_ENABLED && params.get("preview") === "true";

  useEffect(() => {
    if (!isPreview && !loading && !isEmployee) {
      router.replace("/emp-login");
    }
  }, [isEmployee, loading, router, isPreview]);

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
      <AdminSidebar previewMode={isPreview} />
      <main className="flex-1 ml-64 min-h-screen">
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
        <div className="p-6 lg:p-8 max-w-7xl">
          {children}
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
