"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h, formatCents, formatDateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, CheckCircle2, XCircle, Clock,
  ChevronRight, Calendar, Users, DollarSign, Filter, Loader2,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-500/15 text-green-400",
  pending:   "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-[#7C3AED]/15 text-[#7C3AED]",
  no_show:   "bg-orange-500/15 text-orange-400",
};

interface ReservationRow {
  id: string;
  confirmation: string;
  name: string;
  phone: string;
  route: string;
  date: string;
  time: string;
  pax: number;
  totalCents: number;
  status: string;
}

type FilterStatus = "all" | "confirmed" | "completed" | "cancelled";

export default function ReservationsPage() {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("reservations")
        .select(
          "id, confirmation_number, status, adults, children, total_cents, created_at, " +
          "customer:customers(first_name, last_name, phone), " +
          "trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(name))"
        )
        .order("created_at", { ascending: false })
        .limit(500);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRows((data ?? []).map((r: any) => ({
        id: r.id,
        confirmation: r.confirmation_number,
        name: r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : "—",
        phone: r.customer?.phone ?? "",
        route: r.trip?.route?.name ?? "—",
        date: r.trip ? formatDateShort(r.trip.departure_date) : "—",
        time: r.trip ? formatTime12h(r.trip.departure_time) : "—",
        pax: (r.adults ?? 0) + (r.children ?? 0),
        totalCents: r.total_cents,
        status: r.status,
      })));
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = rows.filter((r) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !query ||
      r.name.toLowerCase().includes(q) ||
      r.confirmation.toLowerCase().includes(q) ||
      r.phone.includes(query);
    const matchesFilter = filter === "all" || r.status === filter;
    return matchesQuery && matchesFilter;
  });

  const revenueCents = rows.filter(r => r.status !== "cancelled").reduce((s, r) => s + r.totalCents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reservations</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {loading ? "Loading…" : `${rows.length} total reservations`}
          </p>
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

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Search className="w-8 h-8 text-[#A1A1AA] mb-3" />
            <p className="text-white font-medium mb-1">No reservations found</p>
            <p className="text-[#A1A1AA] text-sm">
              {rows.length === 0
                ? "New bookings will appear here — or create one manually."
                : "Try a different search or filter"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((r) => (
              <Link key={r.id} href={`/admin/reservations/${r.id}`} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center group">
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
                  <span className="text-white font-semibold text-sm">{formatCents(r.totalCents)}</span>
                </div>
                <div className="col-span-1 flex justify-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? ""}`}>
                    {r.status.replace("_", " ")}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A1A1AA] group-hover:text-white group-hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center justify-between glass rounded-xl px-5 py-3">
        <span className="text-[#A1A1AA] text-sm">Showing {filtered.length} of {rows.length}</span>
        <div className="flex items-center gap-4">
          {[
            { icon: CheckCircle2, label: "Confirmed", count: rows.filter(r=>r.status==="confirmed").length, color: "text-green-400" },
            { icon: XCircle,      label: "Cancelled", count: rows.filter(r=>r.status==="cancelled").length, color: "text-red-400" },
            { icon: DollarSign,   label: "Revenue",   count: formatCents(revenueCents), color: "text-[#7C3AED]" },
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
