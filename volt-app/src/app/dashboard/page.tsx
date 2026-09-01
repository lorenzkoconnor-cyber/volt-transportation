"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { canViewFinancials, canAccessRoute } from "@/lib/permissions";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h, formatCents, formatDateShort, localDateString } from "@/lib/format";
import StatCard from "@/components/admin/StatCard";
import {
  Users, DollarSign, Truck, CalendarDays,
  ArrowRight, Clock, MapPin, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashTrip {
  id: string;
  time: string;
  route: string;
  passengers: number;
  capacity: number;
  vehicles: number;
  driver: string;
  status: string;
}

interface DashReservation {
  id: string;
  name: string;
  route: string;
  date: string;
  total: string;
  status: string;
  paymentStatus: string | null;
}

export default function AdminDashboardPage() {
  const { employee, loading: authLoading } = useAuth();
  const role = useDashboardRole();
  const showMoney = canViewFinancials(role);
  const supabase = createClient();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<DashTrip[]>([]);
  const [recent, setRecent] = useState<DashReservation[]>([]);
  const [stats, setStats] = useState({
    revenueToday: 0,
    passengersToday: 0,
    tripsToday: 0,
    activeVehicles: 0,
  });

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      const todayStr = localDateString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const [tripsRes, resvRes, recentRes, vehiclesRes] = await Promise.all([
        // Today's trips with any bookings + their vehicle/driver assignments
        sb.from("trips")
          .select(
            "id, departure_time, total_capacity, seats_booked, status, " +
            "route:routes(name), " +
            "trip_vehicles(vehicle:vehicles(name), driver:drivers(first_name, last_name))"
          )
          .eq("departure_date", todayStr)
          .gt("seats_booked", 0)
          .order("departure_time"),
        // Today's revenue + passengers (reservations on today's trips)
        sb.from("reservations")
          .select("total_cents, adults, children, status, trip:trips!reservations_trip_id_fkey!inner(departure_date)")
          .eq("trip.departure_date", todayStr)
          .neq("status", "cancelled"),
        // Latest bookings
        sb.from("reservations")
          .select(
            "id, status, total_cents, created_at, " +
            "customer:customers(first_name, last_name), " +
            "trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(name)), " +
            "payments(status)"
          )
          .order("created_at", { ascending: false })
          .limit(5),
        sb.from("vehicles").select("id").eq("status", "active"),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTrips((tripsRes.data ?? []).map((t: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const drivers = (t.trip_vehicles ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((tv: any) => tv.driver ? `${tv.driver.first_name} ${tv.driver.last_name[0]}.` : null)
          .filter(Boolean);
        return {
          id: t.id,
          time: formatTime12h(t.departure_time),
          route: t.route?.name ?? "—",
          passengers: t.seats_booked,
          capacity: t.total_capacity,
          vehicles: (t.trip_vehicles ?? []).length,
          driver: drivers.length ? drivers.join(" / ") : "Unassigned",
          status: t.status,
        };
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todayResvs = resvRes.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const revenueToday = todayResvs.reduce((s: number, r: any) => s + r.total_cents, 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passengersToday = todayResvs.reduce((s: number, r: any) => s + (r.adults ?? 0) + (r.children ?? 0), 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRecent((recentRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.customer ? `${r.customer.first_name} ${r.customer.last_name[0]}.` : "—",
        route: r.trip?.route?.name ?? "—",
        date: r.trip ? `${formatDateShort(r.trip.departure_date)} · ${formatTime12h(r.trip.departure_time)}` : "—",
        total: formatCents(r.total_cents),
        status: r.status,
        paymentStatus: r.payments?.[0]?.status ?? null,
      })));

      setStats({
        revenueToday,
        passengersToday,
        tripsToday: (tripsRes.data ?? []).length,
        activeVehicles: (vehiclesRes.data ?? []).length,
      });
      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good morning{employee ? `, ${employee.firstName}` : ""}
          </h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">{today}</p>
        </div>
        {canAccessRoute("/dashboard/reservations/new", role) && (
          <Link href="/dashboard/reservations/new">
            <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
              + New Reservation
            </Button>
          </Link>
        )}
      </div>

      {/* Stats — revenue is owner/manager only; other roles lead with trips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showMoney ? (
          <StatCard label="Today's Revenue" value={loading ? "…" : formatCents(stats.revenueToday)} sub={`${stats.passengersToday} passengers`} icon={DollarSign} accent />
        ) : (
          <StatCard label="Today's Trips" value={loading ? "…" : stats.tripsToday} sub="With bookings" icon={Truck} accent />
        )}
        {showMoney && (
          <StatCard label="Today's Trips" value={loading ? "…" : stats.tripsToday} sub="With bookings" icon={Truck} />
        )}
        <StatCard label="Passengers Today" value={loading ? "…" : stats.passengersToday} sub="Across all trips" icon={Users} />
        <StatCard label="Active Vehicles" value={loading ? "…" : stats.activeVehicles} sub="In the fleet" icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Today&apos;s Schedule</h2>
            <Link href="/dashboard/dispatch" className="text-[#7C3AED] text-sm hover:text-[#9D5FF5] flex items-center gap-1 transition-colors">
              Full dispatch <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="glass rounded-xl p-10 flex justify-center">
              <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
            </div>
          ) : trips.length === 0 ? (
            <div className="glass rounded-xl p-10 text-center">
              <Truck className="w-8 h-8 text-[#A1A1AA] mx-auto mb-3" />
              <p className="text-white font-medium mb-1">No booked trips today</p>
              <p className="text-[#A1A1AA] text-sm">Trips appear here once passengers book seats.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => (
                <div key={trip.id} className="glass rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-[#7C3AED]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">{trip.time}</span>
                          <span className="text-[#A1A1AA] text-sm truncate">{trip.route}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#A1A1AA] flex-wrap">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {trip.passengers}/{trip.capacity} seats
                          </span>
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {trip.vehicles} vehicle{trip.vehicles !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1 truncate max-w-[180px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {trip.driver}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Seat fill bar */}
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#7C3AED]"
                          style={{ width: `${Math.min(100, (trip.passengers / trip.capacity) * 100)}%` }}
                        />
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          trip.status === "completed"
                            ? "bg-green-500/15 text-green-400"
                            : trip.status === "cancelled"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {trip.status === "completed" ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Done</span>
                        ) : trip.status === "cancelled" ? "Cancelled" : "Scheduled"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Reservations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Recent Bookings</h2>
            <Link href="/dashboard/reservations" className="text-[#7C3AED] text-sm hover:text-[#9D5FF5] flex items-center gap-1 transition-colors">
              All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="glass rounded-xl p-8 flex justify-center">
              <Loader2 className="w-5 h-5 text-[#7C3AED] animate-spin" />
            </div>
          ) : recent.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <p className="text-[#A1A1AA] text-sm">No bookings yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((r) => (
                <Link key={r.id} href={`/dashboard/reservations/${r.id}`}>
                  <div className="glass rounded-xl p-4 flex items-center justify-between gap-3 hover:border-[#7C3AED]/30 transition-all cursor-pointer mb-2">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{r.name}</div>
                      <div className="text-[#A1A1AA] text-xs truncate">{r.route}</div>
                      <div className="text-[#A1A1AA] text-xs">{r.date}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {showMoney && <div className="text-white font-semibold text-sm">{r.total}</div>}
                      {r.paymentStatus === "paid" ? (
                        <div className="flex items-center gap-1 text-green-400 text-xs justify-end">
                          <CheckCircle2 className="w-3 h-3" />
                          Paid
                        </div>
                      ) : (
                        <div className="text-[#A1A1AA] text-xs capitalize">{r.paymentStatus ?? r.status}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-white font-bold text-lg mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "View Dispatch", href: "/dashboard/dispatch", icon: Truck },
            { label: "Search Reservations", href: "/dashboard/reservations", icon: CalendarDays },
            { label: "Payment Reports", href: "/dashboard/reports", icon: DollarSign },
            { label: "Manage Vehicles", href: "/dashboard/vehicles", icon: AlertCircle },
          ]
            // Only surface actions this role can actually open.
            .filter((action) => canAccessRoute(action.href, role))
            .map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href}>
                <div className="glass rounded-xl p-4 flex items-center gap-3 hover:border-[#7C3AED]/30 transition-all group cursor-pointer">
                  <Icon className="w-4 h-4 text-[#A1A1AA] group-hover:text-[#7C3AED] transition-colors flex-shrink-0" />
                  <span className="text-[#A1A1AA] text-sm group-hover:text-white transition-colors">{action.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
