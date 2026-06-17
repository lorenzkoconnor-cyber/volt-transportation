"use client";

import { useState } from "react";
import { TrendingUp, Users, Truck, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import StatCard from "@/components/admin/StatCard";

const DAILY_STATS = [
  { date: "Jun 28", revenue: 1240, passengers: 21, trips: 18 },
  { date: "Jun 29", revenue: 890,  passengers: 15, trips: 14 },
  { date: "Jun 30", revenue: 1650, passengers: 28, trips: 22 },
  { date: "Jul 1",  revenue: 2100, passengers: 36, trips: 26 },
  { date: "Jul 2",  revenue: 1380, passengers: 23, trips: 20 },
  { date: "Jul 3",  revenue: 980,  passengers: 17, trips: 16 },
  { date: "Jul 4",  revenue: 1820, passengers: 31, trips: 24 },
];

const ROUTE_STATS = [
  { route: "Columbus → ATL", trips: 63, passengers: 98,  revenue: 5782, avgLoad: "74%", trend: 8 },
  { route: "ATL → Columbus", trips: 57, passengers: 73,  revenue: 4307, avgLoad: "64%", trend: -3 },
];

const MAX_REVENUE = Math.max(...DAILY_STATS.map((d) => d.revenue));

export default function ReportsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");

  const totalRevenue   = DAILY_STATS.reduce((s, d) => s + d.revenue, 0);
  const totalPassengers = DAILY_STATS.reduce((s, d) => s + d.passengers, 0);
  const totalTrips     = DAILY_STATS.reduce((s, d) => s + d.trips, 0);
  const avgRevPerDay   = Math.round(totalRevenue / DAILY_STATS.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">Revenue, passengers, and route performance</p>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-[#7C3AED] text-white" : "glass text-[#A1A1AA] hover:text-white"}`}>
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"    value={`$${totalRevenue.toLocaleString()}`} sub={`$${avgRevPerDay}/day avg`} icon={DollarSign} accent trend={{ value: "12%", positive: true }} />
        <StatCard label="Total Passengers" value={totalPassengers} sub="Both directions" icon={Users} trend={{ value: "8%", positive: true }} />
        <StatCard label="Total Trips"      value={totalTrips}      sub="Completed"       icon={Truck} />
        <StatCard label="Avg Occupancy"    value="69%"             sub="Per vehicle"     icon={TrendingUp} trend={{ value: "5%", positive: true }} />
      </div>

      {/* Revenue chart */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-white font-bold text-lg mb-6">Daily Revenue</h2>
        <div className="flex items-end gap-3 h-48">
          {DAILY_STATS.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
              <div className="text-white text-xs font-semibold">${(day.revenue/1000).toFixed(1)}k</div>
              <div className="w-full flex items-end" style={{ height: "140px" }}>
                <div
                  className="w-full rounded-t-lg bg-[#7C3AED] hover:bg-[#9D5FF5] transition-colors cursor-default"
                  style={{ height: `${(day.revenue / MAX_REVENUE) * 100}%` }}
                />
              </div>
              <div className="text-[#A1A1AA] text-xs">{day.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Route performance */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8">
          <h2 className="text-white font-bold text-lg">Route Performance</h2>
        </div>
        <div className="divide-y divide-white/6">
          {ROUTE_STATS.map((r) => (
            <div key={r.route} className="grid grid-cols-2 sm:grid-cols-6 gap-4 px-4 sm:px-6 py-5 items-center">
              <div className="col-span-2">
                <div className="text-white font-semibold text-sm">{r.route}</div>
                <div className="text-[#A1A1AA] text-xs mt-0.5">{r.trips} trips in period</div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold">{r.passengers}</div>
                <div className="text-[#A1A1AA] text-xs">Passengers</div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold">${r.revenue.toLocaleString()}</div>
                <div className="text-[#A1A1AA] text-xs">Revenue</div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold">{r.avgLoad}</div>
                <div className="text-[#A1A1AA] text-xs">Avg Load</div>
              </div>
              <div className="flex justify-end">
                <span className={`flex items-center gap-1 text-sm font-semibold ${r.trend >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.trend >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {Math.abs(r.trend)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily breakdown table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8">
          <h2 className="text-white font-bold text-lg">Daily Breakdown</h2>
        </div>
        <div className="grid grid-cols-4 gap-4 px-4 sm:px-6 py-3 border-b border-white/6 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
          <div>Date</div><div className="text-center">Trips</div><div className="text-center">Passengers</div><div className="text-right">Revenue</div>
        </div>
        <div className="divide-y divide-white/5">
          {DAILY_STATS.map((day) => (
            <div key={day.date} className="grid grid-cols-4 gap-4 px-4 sm:px-6 py-3 hover:bg-white/3 transition-colors">
              <div className="text-white text-sm">{day.date}</div>
              <div className="text-center text-[#A1A1AA] text-sm">{day.trips}</div>
              <div className="text-center text-[#A1A1AA] text-sm">{day.passengers}</div>
              <div className="text-right text-white font-semibold text-sm">${day.revenue.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-t border-white/10 bg-[#7C3AED]/5">
          <div className="text-white font-bold text-sm">Totals</div>
          <div className="text-center text-white font-bold text-sm">{totalTrips}</div>
          <div className="text-center text-white font-bold text-sm">{totalPassengers}</div>
          <div className="text-right text-[#7C3AED] font-bold text-sm">${totalRevenue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
