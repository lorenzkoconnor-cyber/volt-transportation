"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, CheckCircle2, XCircle, Clock,
  ChevronRight, Calendar, Users, DollarSign, Filter,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-500/15 text-green-400",
  pending:   "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-[#7C3AED]/15 text-[#7C3AED]",
  no_show:   "bg-orange-500/15 text-orange-400",
};

const MOCK_RESERVATIONS = [
  { id: "1", confirmation: "VOLT-AB1234", name: "Sarah Mitchell",    phone: "(706) 555-0101", route: "Columbus → ATL", date: "Jul 18", time: "8:00 AM",  pax: 2, total: 118, status: "confirmed" },
  { id: "2", confirmation: "VOLT-CD5678", name: "James Lawson",      phone: "(706) 555-0202", route: "Columbus → ATL", date: "Jul 18", time: "10:00 AM", pax: 3, total: 177, status: "confirmed" },
  { id: "3", confirmation: "VOLT-EF9012", name: "Tanya Williams",    phone: "(706) 555-0303", route: "ATL → Columbus", date: "Jul 19", time: "2:00 PM",  pax: 1, total: 59,  status: "confirmed" },
  { id: "4", confirmation: "VOLT-GH3456", name: "Robert King",       phone: "(706) 555-0404", route: "Columbus → ATL", date: "Jul 20", time: "6:00 AM",  pax: 4, total: 236, status: "confirmed" },
  { id: "5", confirmation: "VOLT-IJ7890", name: "Diana Foster",      phone: "(706) 555-0505", route: "Columbus → ATL", date: "Jul 15", time: "9:00 AM",  pax: 1, total: 59,  status: "completed" },
  { id: "6", confirmation: "VOLT-KL2345", name: "Marcus Thompson",   phone: "(706) 555-0606", route: "ATL → Columbus", date: "Jul 17", time: "4:00 PM",  pax: 2, total: 118, status: "cancelled" },
];

type FilterStatus = "all" | "confirmed" | "completed" | "cancelled";

export default function ReservationsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filtered = MOCK_RESERVATIONS.filter((r) => {
    const matchesQuery =
      !query ||
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.confirmation.toLowerCase().includes(query.toLowerCase()) ||
      r.phone.includes(query);
    const matchesFilter = filter === "all" || r.status === filter;
    return matchesQuery && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reservations</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">{MOCK_RESERVATIONS.length} total reservations</p>
        </div>
        <Link href="/admin/reservations/new">
          <Button className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
            <Plus className="w-4 h-4 mr-1.5" /> New Reservation
          </Button>
        </Link>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, confirmation number, or phone…"
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-11 rounded-xl focus:border-[#7C3AED]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#A1A1AA]" />
          {(["all", "confirmed", "completed", "cancelled"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? "bg-[#7C3AED] text-white"
                  : "glass text-[#A1A1AA] hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/8 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
          <div className="col-span-3">Passenger</div>
          <div className="col-span-2">Confirmation</div>
          <div className="col-span-3">Trip</div>
          <div className="col-span-1 text-center">Pax</div>
          <div className="col-span-1 text-right">Total</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1" />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Search className="w-8 h-8 text-[#A1A1AA] mb-3" />
            <p className="text-white font-medium mb-1">No reservations found</p>
            <p className="text-[#A1A1AA] text-sm">Try a different search or filter</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((r) => (
              <div key={r.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center group">
                <div className="col-span-3">
                  <div className="text-white font-medium text-sm">{r.name}</div>
                  <div className="text-[#A1A1AA] text-xs">{r.phone}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-[#7C3AED] text-xs font-mono">{r.confirmation}</span>
                </div>
                <div className="col-span-3">
                  <div className="text-white text-sm">{r.route}</div>
                  <div className="text-[#A1A1AA] text-xs flex items-center gap-2">
                    <Calendar className="w-3 h-3" />{r.date}
                    <Clock className="w-3 h-3 ml-1" />{r.time}
                  </div>
                </div>
                <div className="col-span-1 flex justify-center">
                  <span className="flex items-center gap-1 text-[#A1A1AA] text-sm">
                    <Users className="w-3.5 h-3.5" />{r.pax}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-white font-semibold text-sm">${r.total}</span>
                </div>
                <div className="col-span-1 flex justify-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Link href={`/admin/reservations/${r.id}`}>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center justify-between glass rounded-xl px-5 py-3">
        <span className="text-[#A1A1AA] text-sm">Showing {filtered.length} of {MOCK_RESERVATIONS.length}</span>
        <div className="flex items-center gap-4">
          {[
            { icon: CheckCircle2, label: "Confirmed", count: MOCK_RESERVATIONS.filter(r=>r.status==="confirmed").length, color: "text-green-400" },
            { icon: XCircle,      label: "Cancelled", count: MOCK_RESERVATIONS.filter(r=>r.status==="cancelled").length, color: "text-red-400" },
            { icon: DollarSign,   label: "Revenue",   count: `$${MOCK_RESERVATIONS.filter(r=>r.status!=="cancelled").reduce((s,r)=>s+r.total,0)}`, color: "text-[#7C3AED]" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.label} className={`flex items-center gap-1.5 text-sm ${item.color}`}>
                <Icon className="w-3.5 h-3.5" />{item.count} {item.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
