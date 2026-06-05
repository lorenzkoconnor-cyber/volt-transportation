"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import StatCard from "@/components/admin/StatCard";
import {
  Users, DollarSign, Truck, CalendarDays,
  ArrowRight, Clock, MapPin, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Mock data — replace with Supabase queries
const TODAY_TRIPS = [
  { id: "1", time: "8:00 AM", route: "Columbus → ATL", passengers: 7, capacity: 8, vehicles: 1, driver: "Marcus J.", status: "scheduled" },
  { id: "2", time: "9:00 AM", route: "ATL → Columbus", passengers: 4, capacity: 8, vehicles: 1, driver: "Darnell R.", status: "scheduled" },
  { id: "3", time: "10:00 AM", route: "Columbus → ATL", passengers: 12, capacity: 16, vehicles: 2, driver: "Marcus J. / Darnell R.", status: "scheduled" },
  { id: "4", time: "7:00 AM", route: "Columbus → ATL", passengers: 8, capacity: 8, vehicles: 1, driver: "Marcus J.", status: "completed" },
];

const RECENT_RESERVATIONS = [
  { id: "1", name: "Sarah M.", route: "Columbus → ATL", date: "Today · 10:00 AM", total: 118, status: "confirmed" },
  { id: "2", name: "James L.", route: "Columbus → ATL", date: "Today · 8:00 AM", total: 59, status: "confirmed" },
  { id: "3", name: "Tanya W.", route: "ATL → Columbus", date: "Today · 9:00 AM", total: 49, status: "confirmed" },
  { id: "4", name: "Robert K.", route: "Columbus → ATL", date: "Tomorrow · 6:00 AM", total: 177, status: "confirmed" },
];

export default function AdminDashboardPage() {
  const { employee } = useAuth();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

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
        <Link href="/admin/reservations/new">
          <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
            + New Reservation
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's Revenue" value="$1,829" sub="31 passengers" icon={DollarSign} trend={{ value: "12%", positive: true }} accent />
        <StatCard label="Today's Trips" value="18" sub="Both directions" icon={Truck} />
        <StatCard label="Passengers Today" value="31" sub="Across all trips" icon={Users} />
        <StatCard label="Active Vehicles" value="2" sub="2 assigned today" icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Today&apos;s Schedule</h2>
            <Link href="/admin/dispatch" className="text-[#7C3AED] text-sm hover:text-[#9D5FF5] flex items-center gap-1 transition-colors">
              Full dispatch <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {TODAY_TRIPS.map((trip) => (
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
                          {trip.vehicles} vehicle{trip.vehicles > 1 ? "s" : ""}
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
                        style={{ width: `${(trip.passengers / trip.capacity) * 100}%` }}
                      />
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        trip.status === "completed"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {trip.status === "completed" ? (
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Done</span>
                      ) : "Scheduled"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Reservations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Recent Bookings</h2>
            <Link href="/admin/reservations" className="text-[#7C3AED] text-sm hover:text-[#9D5FF5] flex items-center gap-1 transition-colors">
              All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {RECENT_RESERVATIONS.map((r) => (
              <div key={r.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{r.name}</div>
                  <div className="text-[#A1A1AA] text-xs truncate">{r.route}</div>
                  <div className="text-[#A1A1AA] text-xs">{r.date}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-white font-semibold text-sm">${r.total}</div>
                  <div className="flex items-center gap-1 text-green-400 text-xs justify-end">
                    <CheckCircle2 className="w-3 h-3" />
                    Paid
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-white font-bold text-lg mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "View Dispatch", href: "/admin/dispatch", icon: Truck },
            { label: "Search Reservations", href: "/admin/reservations", icon: CalendarDays },
            { label: "Payment Reports", href: "/admin/reports", icon: DollarSign },
            { label: "Manage Vehicles", href: "/admin/vehicles", icon: AlertCircle },
          ].map((action) => {
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
