"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, CheckCircle2, XCircle, UserX, MapPin, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOCK_MANIFEST = [
  { id: "p1", name: "Sarah Mitchell",  phone: "(706) 555-0101", isPrimary: true,  isBoarded: true,  isNoShow: false, notes: "Needs help with large suitcase" },
  { id: "p2", name: "David Mitchell",  phone: "(706) 555-0101", isPrimary: false, isBoarded: true,  isNoShow: false, notes: "" },
  { id: "p3", name: "James Lawson",    phone: "(706) 555-0202", isPrimary: true,  isBoarded: false, isNoShow: false, notes: "" },
  { id: "p4", name: "Lisa Lawson",     phone: "(706) 555-0202", isPrimary: false, isBoarded: false, isNoShow: false, notes: "" },
  { id: "p5", name: "Tanya Williams",  phone: "(706) 555-0303", isPrimary: true,  isBoarded: false, isNoShow: true,  notes: "Called — running late" },
  { id: "p6", name: "Robert King",     phone: "(706) 555-0404", isPrimary: true,  isBoarded: false, isNoShow: false, notes: "Military — discount applied" },
  { id: "p7", name: "Michael King",    phone: "(706) 555-0404", isPrimary: false, isBoarded: false, isNoShow: false, notes: "" },
];

type PassengerStatus = "boarded" | "no_show" | "waiting";

interface Passenger {
  id: string; name: string; phone: string; isPrimary: boolean;
  isBoarded: boolean; isNoShow: boolean; notes: string;
}

function ManifestContent() {
  const params = useSearchParams();
  const tripId = params.get("tripId") ?? "d3";

  const [passengers, setPassengers] = useState<Passenger[]>(MOCK_MANIFEST);

  const toggleStatus = (id: string, status: PassengerStatus) => {
    setPassengers((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              isBoarded: status === "boarded" ? !p.isBoarded : false,
              isNoShow: status === "no_show" ? !p.isNoShow : false,
            }
          : p
      )
    );
  };

  const boardedCount  = passengers.filter((p) => p.isBoarded).length;
  const noShowCount   = passengers.filter((p) => p.isNoShow).length;
  const waitingCount  = passengers.filter((p) => !p.isBoarded && !p.isNoShow).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dispatch">
          <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Passenger Manifest</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">8:00 AM · Columbus → ATL · {passengers.length} passengers</p>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Boarded",  count: boardedCount, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Waiting",  count: waitingCount, icon: UserX,        color: "text-yellow-400", bg: "bg-yellow-500/10" },
          { label: "No Show",  count: noShowCount,  icon: XCircle,      color: "text-red-400",   bg: "bg-red-500/10" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`glass rounded-xl p-4 flex items-center gap-3 ${item.bg} border-0`}>
              <Icon className={`w-5 h-5 ${item.color} flex-shrink-0`} />
              <div>
                <div className="text-white font-bold text-xl">{item.count}</div>
                <div className={`text-xs ${item.color}`}>{item.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Passenger list */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
          <span className="text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">Passenger Manifest</span>
          <Button variant="ghost" size="sm" className="text-[#7C3AED] hover:text-[#9D5FF5] text-xs">
            Mark All Boarded
          </Button>
        </div>
        <div className="divide-y divide-white/5">
          {passengers.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-5 py-4 transition-colors ${
                p.isBoarded ? "bg-green-500/4" : p.isNoShow ? "bg-red-500/4" : ""
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  p.isBoarded ? "bg-green-500/20 text-green-400" :
                  p.isNoShow  ? "bg-red-500/20 text-red-400" :
                  "bg-white/10 text-[#A1A1AA]"
                }`}>
                  {p.isBoarded ? "✓" : p.isNoShow ? "✗" : p.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${p.isBoarded ? "text-green-400" : p.isNoShow ? "text-red-400 line-through opacity-60" : "text-white"}`}>
                      {p.name}
                    </span>
                    {p.isPrimary && (
                      <span className="text-[#7C3AED] text-xs bg-[#7C3AED]/10 px-1.5 py-0.5 rounded">Lead</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[#A1A1AA] text-xs flex-wrap">
                    <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                      <Phone className="w-3 h-3" />{p.phone}
                    </a>
                    {p.notes && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <MessageSquare className="w-3 h-3" />{p.notes}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleStatus(p.id, "boarded")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    p.isBoarded
                      ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                      : "glass text-[#A1A1AA] hover:text-green-400 hover:border-green-500/30"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {p.isBoarded ? "Boarded" : "Board"}
                </button>
                <button
                  onClick={() => toggleStatus(p.id, "no_show")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    p.isNoShow
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "glass text-[#A1A1AA] hover:text-red-400 hover:border-red-500/30"
                  }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  {p.isNoShow ? "No Show" : "No Show"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mark trip complete */}
      <div className="glass rounded-xl p-5 flex items-center justify-between">
        <div>
          <div className="text-white font-semibold">Ready to depart?</div>
          <div className="text-[#A1A1AA] text-sm">{boardedCount} of {passengers.length} passengers boarded</div>
        </div>
        <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
          <MapPin className="w-4 h-4 mr-2" />
          Mark Trip Departed
        </Button>
      </div>
    </div>
  );
}

export default function ManifestPage() {
  return (
    <Suspense fallback={<div className="text-[#A1A1AA] p-8">Loading manifest…</div>}>
      <ManifestContent />
    </Suspense>
  );
}
