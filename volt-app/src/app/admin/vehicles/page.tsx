"use client";

import { useState } from "react";
import { Car, Plus, CheckCircle2, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MOCK_VEHICLES = [
  { id: "v1", name: "Sprinter 01", plate: "VOLT-001", make: "Mercedes", model: "Sprinter 2500", year: 2023, capacity: 8, status: "active",      assignedDriver: "Marcus Johnson",  notes: "" },
  { id: "v2", name: "Sprinter 02", plate: "VOLT-002", make: "Mercedes", model: "Sprinter 2500", year: 2024, capacity: 8, status: "active",      assignedDriver: "Darnell Roberts", notes: "" },
];

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-green-500/15 text-green-400",
  maintenance: "bg-yellow-500/15 text-yellow-400",
  retired:     "bg-red-500/15 text-red-400",
};
const STATUS_ICONS: Record<string, React.ComponentType<{className?: string}>> = {
  active: CheckCircle2, maintenance: Wrench, retired: XCircle,
};

export default function VehiclesPage() {
  const [vehicles] = useState(MOCK_VEHICLES);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehicles</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">{vehicles.filter(v=>v.status==="active").length} active · {vehicles.length} total</p>
        </div>
        <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Vehicle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {vehicles.map((v) => {
          const Icon = STATUS_ICONS[v.status];
          return (
            <div key={v.id} className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center">
                    <Car className="w-5 h-5 text-[#7C3AED]" />
                  </div>
                  <div>
                    <div className="text-white font-bold">{v.name}</div>
                    <div className="text-[#A1A1AA] text-xs font-mono">{v.plate}</div>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[v.status]}`}>
                  <Icon className="w-3 h-3" />{v.status}
                </span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Make / Model", value: `${v.make} ${v.model}` },
                    { label: "Year",         value: v.year },
                    { label: "Capacity",     value: `${v.capacity} passengers` },
                    { label: "Driver",       value: v.assignedDriver || "Unassigned" },
                  ].map((field) => (
                    <div key={field.label} className="bg-white/3 rounded-lg p-3">
                      <div className="text-[#A1A1AA] text-xs mb-0.5">{field.label}</div>
                      <div className="text-white text-sm font-medium">{field.value}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 border-white/15 text-white hover:bg-white/5 text-xs">Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 border-white/15 text-[#A1A1AA] hover:bg-white/5 text-xs">Schedule Service</Button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add vehicle placeholder */}
        <button className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border-dashed border-white/15 hover:border-[#7C3AED]/40 transition-all group">
          <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-[#7C3AED]/15 flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 text-[#A1A1AA] group-hover:text-[#7C3AED] transition-colors" />
          </div>
          <span className="text-[#A1A1AA] group-hover:text-white text-sm transition-colors">Add New Vehicle</span>
        </button>
      </div>
    </div>
  );
}
