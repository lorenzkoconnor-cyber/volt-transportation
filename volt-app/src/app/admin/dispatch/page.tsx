"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Truck, Clock, ChevronRight, CheckCircle2, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOCK_DISPATCH = [
  {
    id: "d1", time: "6:00 AM", route: "Columbus → ATL", date: "2026-07-18",
    totalPassengers: 6, status: "scheduled",
    vehicles: [{ id: "v1", name: "Sprinter 01", driver: "Marcus J.", passengers: 6, capacity: 8 }],
  },
  {
    id: "d2", time: "7:00 AM", route: "ATL → Columbus", date: "2026-07-18",
    totalPassengers: 8, status: "completed",
    vehicles: [{ id: "v2", name: "Sprinter 02", driver: "Darnell R.", passengers: 8, capacity: 8 }],
  },
  {
    id: "d3", time: "8:00 AM", route: "Columbus → ATL", date: "2026-07-18",
    totalPassengers: 13, status: "scheduled",
    vehicles: [
      { id: "v1", name: "Sprinter 01", driver: "Marcus J.",  passengers: 8, capacity: 8 },
      { id: "v2", name: "Sprinter 02", driver: "Darnell R.", passengers: 5, capacity: 8 },
    ],
  },
  {
    id: "d4", time: "9:00 AM", route: "ATL → Columbus", date: "2026-07-18",
    totalPassengers: 3, status: "scheduled",
    vehicles: [{ id: "v1", name: "Sprinter 01", driver: "Marcus J.", passengers: 3, capacity: 8 }],
  },
  {
    id: "d5", time: "10:00 AM", route: "Columbus → ATL", date: "2026-07-18",
    totalPassengers: 0, status: "scheduled",
    vehicles: [],
  },
];

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  scheduled:   { label: "Scheduled",   class: "bg-blue-500/15 text-blue-400" },
  boarding:    { label: "Boarding",     class: "bg-yellow-500/15 text-yellow-400" },
  in_progress: { label: "In Progress",  class: "bg-[#7C3AED]/15 text-[#7C3AED]" },
  completed:   { label: "Completed",   class: "bg-green-500/15 text-green-400" },
  cancelled:   { label: "Cancelled",   class: "bg-red-500/15 text-red-400" },
};

export default function DispatchPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const totalToday = MOCK_DISPATCH.reduce((s, d) => s + d.totalPassengers, 0);
  const completedTrips = MOCK_DISPATCH.filter((d) => d.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispatch</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {totalToday} passengers · {completedTrips}/{MOCK_DISPATCH.length} trips completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]"
          />
          <Button variant="outline" size="sm" className="border-white/15 text-white hover:bg-white/5">
            <Plus className="w-4 h-4 mr-1" /> Add Trip
          </Button>
        </div>
      </div>

      {/* Dispatch cards */}
      <div className="space-y-4">
        {MOCK_DISPATCH.map((dep) => {
          const statusInfo = STATUS_MAP[dep.status] ?? STATUS_MAP.scheduled;
          const isFull = dep.vehicles.every((v) => v.passengers >= v.capacity);
          const hasNoDriver = dep.vehicles.some((v) => !v.driver) || dep.totalPassengers > 0 && dep.vehicles.length === 0;

          return (
            <div key={dep.id} className="glass rounded-2xl overflow-hidden">
              {/* Trip header */}
              <div className="flex items-center justify-between p-5 border-b border-white/8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-[#7C3AED]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-bold text-lg">{dep.time}</span>
                      <span className="text-[#A1A1AA] text-sm">{dep.route}</span>
                      {hasNoDriver && dep.totalPassengers > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400 text-xs">
                          <AlertTriangle className="w-3 h-3" /> No driver assigned
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[#A1A1AA] text-xs flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{dep.totalPassengers} passengers</span>
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{dep.vehicles.length} vehicle{dep.vehicles.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.class}`}>
                    {dep.status === "completed" ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{statusInfo.label}</span> : statusInfo.label}
                  </span>
                  <Link href={`/admin/manifest?tripId=${dep.id}`}>
                    <button className="flex items-center gap-1 text-[#7C3AED] hover:text-[#9D5FF5] text-xs font-medium transition-colors">
                      Manifest <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                </div>
              </div>

              {/* Vehicle breakdown */}
              {dep.vehicles.length > 0 ? (
                <div className={`divide-y divide-white/5 ${dep.vehicles.length > 1 ? "" : ""}`}>
                  {dep.vehicles.map((vehicle, vIdx) => (
                    <div key={vehicle.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[#A1A1AA] text-xs w-16">Vehicle {vIdx + 1}</span>
                        <div>
                          <span className="text-white text-sm font-medium">{vehicle.name}</span>
                          {vehicle.driver && (
                            <span className="text-[#A1A1AA] text-xs ml-2">· {vehicle.driver}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Fill bar */}
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${vehicle.passengers >= vehicle.capacity ? "bg-red-400" : "bg-[#7C3AED]"}`}
                              style={{ width: `${(vehicle.passengers / vehicle.capacity) * 100}%` }}
                            />
                          </div>
                          <span className={`text-xs ${vehicle.passengers >= vehicle.capacity ? "text-red-400" : "text-[#A1A1AA]"}`}>
                            {vehicle.passengers}/{vehicle.capacity}
                          </span>
                        </div>
                        {vehicle.passengers >= vehicle.capacity && (
                          <span className="text-red-400 text-xs font-medium">FULL</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-[#A1A1AA] text-sm italic">No passengers booked · No vehicles assigned</span>
                  <Button variant="ghost" size="sm" className="text-[#7C3AED] hover:text-[#9D5FF5] hover:bg-[#7C3AED]/10 text-xs">
                    Assign Vehicle
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
