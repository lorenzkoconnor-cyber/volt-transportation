"use client";

import { Bus, Plus, Phone, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOCK_DRIVERS = [
  { id: "dr1", firstName: "Marcus",  lastName: "Johnson", phone: "(706) 555-1001", email: "marcus@volttransportation.com", license: "GA-DL-8821", isActive: true, assignedVehicle: "Sprinter 01", tripsThisWeek: 12 },
  { id: "dr2", firstName: "Darnell", lastName: "Roberts", phone: "(706) 555-1002", email: "darnell@volttransportation.com", license: "GA-DL-4423", isActive: true, assignedVehicle: "Sprinter 02", tripsThisWeek: 11 },
];

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Drivers</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">{MOCK_DRIVERS.filter(d=>d.isActive).length} active drivers</p>
        </div>
        <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Driver
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {MOCK_DRIVERS.map((d) => (
          <div key={d.id} className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#7C3AED]/20 flex items-center justify-center text-white font-bold">
                  {d.firstName[0]}{d.lastName[0]}
                </div>
                <div>
                  <div className="text-white font-bold">{d.firstName} {d.lastName}</div>
                  <div className="text-[#A1A1AA] text-xs font-mono">{d.license}</div>
                </div>
              </div>
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${d.isActive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                {d.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {d.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/3 rounded-lg p-3">
                  <div className="text-[#A1A1AA] text-xs mb-0.5">Vehicle</div>
                  <div className="text-white text-sm font-medium">{d.assignedVehicle}</div>
                </div>
                <div className="bg-white/3 rounded-lg p-3">
                  <div className="text-[#A1A1AA] text-xs mb-0.5">Trips This Week</div>
                  <div className="text-white text-sm font-bold">{d.tripsThisWeek}</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white text-sm transition-colors">
                  <Phone className="w-3.5 h-3.5 text-[#7C3AED]" />{d.phone}
                </a>
                <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white text-sm transition-colors truncate">
                  <Mail className="w-3.5 h-3.5 text-[#7C3AED]" />{d.email}
                </a>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 border-white/15 text-white hover:bg-white/5 text-xs">Edit</Button>
                <Button variant="outline" size="sm" className="flex-1 border-white/15 text-[#A1A1AA] hover:bg-white/5 text-xs">Schedule</Button>
              </div>
            </div>
          </div>
        ))}

        <button className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border-dashed border-white/15 hover:border-[#7C3AED]/40 transition-all group">
          <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-[#7C3AED]/15 flex items-center justify-center transition-colors">
            <Plus className="w-6 h-6 text-[#A1A1AA] group-hover:text-[#7C3AED] transition-colors" />
          </div>
          <span className="text-[#A1A1AA] group-hover:text-white text-sm transition-colors">Add New Driver</span>
        </button>
      </div>
    </div>
  );
}
