"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Truck,
  Users,
  Car,
  UserCog,
  CreditCard,
  BarChart3,
  Zap,
  LogOut,
  ChevronRight,
  Shield,
  Bus,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { rolesForRoute } from "@/lib/permissions";
import type { EmployeeRole } from "@/lib/supabase/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

// Access for each link is derived from the shared RBAC config so the sidebar
// and the route guards can never drift apart.
const NAV_ITEMS: NavItem[] = [
  { href: "/admin",             label: "Dashboard",     icon: LayoutDashboard },
  { href: "/admin/reservations",label: "Reservations",  icon: CalendarDays },
  { href: "/admin/dispatch",    label: "Dispatch",      icon: Truck },
  { href: "/admin/vehicles",    label: "Vehicles",      icon: Car },
  { href: "/admin/drivers",     label: "Drivers",       icon: Bus },
  { href: "/admin/payments",    label: "Payments",      icon: CreditCard },
  { href: "/admin/reports",     label: "Reports",       icon: BarChart3 },
  { href: "/admin/employees",   label: "Employees",     icon: UserCog },
];

export default function AdminSidebar({
  previewMode = false,
  mobileOpen = false,
  onClose,
}: {
  previewMode?: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { employee, signOut } = useAuth();
  const role: EmployeeRole = previewMode ? "owner" : (employee?.role ?? "driver");

  const visibleItems = NAV_ITEMS.filter((item) => rolesForRoute(item.href).includes(role));

  const handleSignOut = async () => {
    await signOut();
    router.replace("/emp-login");
  };

  const roleLabel: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    office_staff: "Office Staff",
    driver: "Driver",
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-[#0F0F0F] border-r border-white/6 flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-white/6">
        <div className="w-8 h-8 rounded-lg bg-[#7C3AED] flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" fill="white" />
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight">Volt</div>
          <div className="text-[#A1A1AA] text-xs">Operations</div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="ml-auto lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Role badge */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg px-3 py-2">
          <Shield className="w-3.5 h-3.5 text-[#7C3AED] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-white text-xs font-semibold truncate">
              {previewMode ? "Preview Owner" : (employee ? `${employee.firstName} ${employee.lastName}` : "Staff")}
            </div>
            <div className="text-[#7C3AED] text-xs">{roleLabel[role]}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const linkHref = previewMode
              ? `${item.href}?preview=true`
              : item.href;
            const isActive = pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={linkHref}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-[#7C3AED] text-white"
                      : "text-[#A1A1AA] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-[#A1A1AA] group-hover:text-white"}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white text-xs flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom: back to site + sign out */}
      <div className="px-3 pb-4 space-y-1 border-t border-white/6 pt-3">
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-all"
        >
          <Users className="w-4 h-4" />
          Public Site
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#A1A1AA] hover:text-red-400 hover:bg-red-500/8 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
      </aside>
    </>
  );
}
