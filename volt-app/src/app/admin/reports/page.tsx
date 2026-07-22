"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateShort, localDateString } from "@/lib/format";
import { TrendingUp, Users, Truck, DollarSign, Loader2, Download } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";

type Period = "7d" | "30d" | "90d";
const PERIOD_DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ReportsPage() {
  const supabase = createClient();
  const sb = supabase as any;

  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    const end = localDateString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (PERIOD_DAYS[period] - 1));
    const start = localDateString(startDate);

    const load = async () => {
      const [resvRes, tripsRes] = await Promise.all([
        sb.from("reservations")
          .select(
            "adults, children, total_cents, status, " +
            "trip:trips!reservations_trip_id_fkey!inner(id, departure_date, route_id)"
          )
          .gte("trip.departure_date", start)
          .lte("trip.departure_date", end)
          .neq("status", "cancelled"),
        sb.from("trips")
          .select("id, departure_date, route_id, seats_booked, total_capacity, route:routes(name)")
          .gte("departure_date", start)
          .lte("departure_date", end)
          .gt("seats_booked", 0),
      ]);
      setReservations(resvRes.data ?? []);
      setTrips(tripsRes.data ?? []);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const { daily, routeStats, totals } = useMemo(() => {
    // Group by day
    const dayMap = new Map<string, { revenue: number; passengers: number; tripIds: Set<string> }>();
    reservations.forEach((r) => {
      const d = r.trip.departure_date;
      const entry = dayMap.get(d) ?? { revenue: 0, passengers: 0, tripIds: new Set() };
      entry.revenue += r.total_cents;
      entry.passengers += (r.adults ?? 0) + (r.children ?? 0);
      entry.tripIds.add(r.trip.id);
      dayMap.set(d, entry);
    });
    const daily = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, revenue: v.revenue, passengers: v.passengers, trips: v.tripIds.size }));

    // Group trips by route
    const routeMap = new Map<string, { name: string; trips: number; passengers: number; capacity: number; revenue: number }>();
    trips.forEach((t) => {
      const entry = routeMap.get(t.route_id) ?? { name: t.route?.name ?? "—", trips: 0, passengers: 0, capacity: 0, revenue: 0 };
      entry.trips += 1;
      entry.passengers += t.seats_booked;
      entry.capacity += t.total_capacity;
      routeMap.set(t.route_id, entry);
    });
    reservations.forEach((r) => {
      const entry = routeMap.get(r.trip.route_id);
      if (entry) entry.revenue += r.total_cents;
    });
    const routeStats = [...routeMap.values()];

    const totals = {
      revenue: daily.reduce((s, d) => s + d.revenue, 0),
      passengers: daily.reduce((s, d) => s + d.passengers, 0),
      trips: daily.reduce((s, d) => s + d.trips, 0),
      occupancy: routeStats.reduce((s, r) => s + r.capacity, 0) > 0
        ? Math.round((routeStats.reduce((s, r) => s + r.passengers, 0) / routeStats.reduce((s, r) => s + r.capacity, 0)) * 100)
        : 0,
    };

    return { daily, routeStats, totals };
  }, [reservations, trips]);

  const exportCsv = () => {
    const header = "Date,Trips,Passengers,Revenue (USD)";
    const body = daily
      .map((d) => `${d.date},${d.trips},${d.passengers},${(d.revenue / 100).toFixed(2)}`)
      .join("\n");
    const totalsRow = `Totals,${totals.trips},${totals.passengers},${(totals.revenue / 100).toFixed(2)}`;
    const csv = [header, body, totalsRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `volt-report-${period}-${localDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxRevenue = Math.max(1, ...daily.map((d) => d.revenue));
  const activeDays = Math.max(1, daily.length);
  const chartDays = daily.slice(-30); // keep the chart readable on 90d

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
          <Button
            variant="outline"
            size="sm"
            disabled={loading || daily.length === 0}
            onClick={exportCsv}
            className="border-white/15 text-white hover:bg-white/5 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"    value={loading ? "…" : formatCents(totals.revenue)} sub={`${formatCents(Math.round(totals.revenue / activeDays))}/day avg`} icon={DollarSign} accent />
        <StatCard label="Total Passengers" value={loading ? "…" : totals.passengers} sub="Both directions" icon={Users} />
        <StatCard label="Booked Trips"     value={loading ? "…" : totals.trips}      sub="With passengers" icon={Truck} />
        <StatCard label="Avg Occupancy"    value={loading ? "…" : `${totals.occupancy}%`} sub="Of booked trips" icon={TrendingUp} />
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-16 flex justify-center">
          <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
        </div>
      ) : daily.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <TrendingUp className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">No booking data in this period</p>
          <p className="text-[#A1A1AA] text-sm">Reports fill in automatically as reservations come in.</p>
        </div>
      ) : (
        <>
          {/* Revenue chart */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-white font-bold text-lg mb-6">
              Daily Revenue{period === "90d" && chartDays.length < daily.length ? " (last 30 days shown)" : ""}
            </h2>
            <div className="flex items-end gap-1.5 sm:gap-3 h-48 overflow-x-auto">
              {chartDays.map((day) => (
                <div key={day.date} className="flex-1 min-w-[28px] flex flex-col items-center gap-2">
                  <div className="text-white text-[10px] sm:text-xs font-semibold">
                    {day.revenue >= 100000 ? `$${(day.revenue / 100000).toFixed(1)}k` : formatCents(day.revenue)}
                  </div>
                  <div className="w-full flex items-end" style={{ height: "140px" }}>
                    <div
                      className="w-full rounded-t-lg bg-[#7C3AED] hover:bg-[#9D5FF5] transition-colors cursor-default"
                      style={{ height: `${Math.max(2, (day.revenue / maxRevenue) * 100)}%` }}
                      title={`${formatDateShort(day.date)}: ${formatCents(day.revenue)}`}
                    />
                  </div>
                  <div className="text-[#A1A1AA] text-[10px] sm:text-xs whitespace-nowrap">{formatDateShort(day.date)}</div>
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
              {routeStats.map((r) => (
                <div key={r.name} className="grid grid-cols-2 sm:grid-cols-5 gap-4 px-4 sm:px-6 py-5 items-center">
                  <div className="col-span-2">
                    <div className="text-white font-semibold text-sm">{r.name}</div>
                    <div className="text-[#A1A1AA] text-xs mt-0.5">{r.trips} booked trip{r.trips !== 1 ? "s" : ""} in period</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-bold">{r.passengers}</div>
                    <div className="text-[#A1A1AA] text-xs">Passengers</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-bold">{formatCents(r.revenue)}</div>
                    <div className="text-[#A1A1AA] text-xs">Revenue</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-bold">{r.capacity > 0 ? Math.round((r.passengers / r.capacity) * 100) : 0}%</div>
                    <div className="text-[#A1A1AA] text-xs">Avg Load</div>
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
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {daily.map((day) => (
                <div key={day.date} className="grid grid-cols-4 gap-4 px-4 sm:px-6 py-3 hover:bg-white/3 transition-colors">
                  <div className="text-white text-sm">{formatDateShort(day.date)}</div>
                  <div className="text-center text-[#A1A1AA] text-sm">{day.trips}</div>
                  <div className="text-center text-[#A1A1AA] text-sm">{day.passengers}</div>
                  <div className="text-right text-white font-semibold text-sm">{formatCents(day.revenue)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-4 px-6 py-4 border-t border-white/10 bg-[#7C3AED]/5">
              <div className="text-white font-bold text-sm">Totals</div>
              <div className="text-center text-white font-bold text-sm">{totals.trips}</div>
              <div className="text-center text-white font-bold text-sm">{totals.passengers}</div>
              <div className="text-right text-[#7C3AED] font-bold text-sm">{formatCents(totals.revenue)}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
