"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { canViewFinancials } from "@/lib/permissions";
import { useDashboardRole } from "@/lib/useDashboardRole";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h, formatCents, formatDateShort, localDateString } from "@/lib/format";
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
  completed: "bg-[#FCC300]/15 text-[#FCC300]",
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
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ReservationsContent />
    </Suspense>
  );
}

function ReservationsContent() {
  const supabase = createClient();
  const showMoney = canViewFinancials(useDashboardRole());
  const router = useRouter();
  const pathname = usePathname();
  // ?day=today — only reservations on today's trips (what the dashboard's
  // Today's Revenue / Passengers Today cards count).
  const todayOnly = useSearchParams().get("day") === "today";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const toggleToday = () => {
    setLoading(true);
    router.replace(todayOnly ? pathname : `${pathname}?day=today`, { scroll: false });
  };

  useEffect(() => {
    const load = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let req = (supabase as any)
        .from("reservations")
        .select(
          "id, confirmation_number, status, adults, children, total_cents, created_at, " +
          "customer:customers(first_name, last_name, phone), " +
          `trip:trips!reservations_trip_id_fkey${todayOnly ? "!inner" : ""}(departure_date, departure_time, route:routes(name))`
        );
      if (todayOnly) req = req.eq("trip.departure_date", localDateString());
      const { data } = await req
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
  }, [todayOnly]);

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
            {loading
              ? "Loading…"
              : todayOnly
              ? `${rows.length} on today's trips`
              : `${rows.length} total reservations`}
          </p>
        </div>
        <Link href="/dashboard/reservations/new">
          <Button className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
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
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-11 rounded-xl focus:border-[#FCC300]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-[#A1A1AA]" />
          <button
            onClick={toggleToday}
            aria-pressed={todayOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              todayOnly
                ? "bg-[#FCC300] text-[#0A0A0A]"
                : "glass text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Calendar className="w-3 h-3" /> Today&apos;s trips
          </button>
          <span className="w-px h-4 bg-white/10" aria-hidden />
          {(["all", "confirmed", "completed", "cancelled"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? "bg-[#FCC300] text-[#0A0A0A]"
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
        {/* Scrolls sideways on phones instead of squeezing the columns */}
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/8 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
              <div className="col-span-3">Passenger</div>
              <div className="col-span-2">Confirmation</div>
              <div className={showMoney ? "col-span-3" : "col-span-4"}>Trip</div>
              <div className="col-span-1 text-center">Pax</div>
              {showMoney && <div className="col-span-1 text-right">Total</div>}
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1" />
            </div>

            {loading ? (
              <div className="flex justify-center py-16 sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
                <Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
                <Search className="w-8 h-8 text-[#A1A1AA] mb-3" />
                <p className="text-white font-medium mb-1">No reservations found</p>
                <p className="text-[#A1A1AA] text-sm">
                  {rows.length === 0 && todayOnly
                    ? "No bookings on today's trips yet."
                    : rows.length === 0
                    ? "New bookings will appear here — or create one manually."
                    : "Try a different search or filter"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <Link key={r.id} href={`/dashboard/reservations/${r.id}`} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center group">
                    <div className="col-span-3">
                      <div className="text-white font-medium text-sm">{r.name}</div>
                      <div className="text-[#A1A1AA] text-xs">{r.phone}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#FCC300] text-xs font-mono">{r.confirmation}</span>
                    </div>
                    <div className={showMoney ? "col-span-3" : "col-span-4"}>
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
                    {showMoney && (
                      <div className="col-span-1 text-right">
                        <span className="text-white font-semibold text-sm">{formatCents(r.totalCents)}</span>
                      </div>
                    )}
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
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 glass rounded-xl px-4 sm:px-5 py-3">
        <span className="text-[#A1A1AA] text-sm">Showing {filtered.length} of {rows.length}</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            { icon: CheckCircle2, label: "Confirmed", count: rows.filter(r=>r.status==="confirmed").length, color: "text-green-400" },
            { icon: XCircle,      label: "Cancelled", count: rows.filter(r=>r.status==="cancelled").length, color: "text-red-400" },
            // Company revenue is owner/manager only.
            ...(showMoney ? [{ icon: DollarSign, label: "Revenue", count: formatCents(revenueCents), color: "text-[#FCC300]" }] : []),
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
