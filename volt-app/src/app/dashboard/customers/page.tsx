"use client";

// Dashboard → Customers (owners & managers). One profile for every customer who
// has ever booked with Volt — contact details, booking history and lifetime
// spend. Customers are one record per email + phone (src/lib/checkout.ts
// findCustomer), so repeat riders roll up under a single profile.

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateShort, formatTime12h, localDateString } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/admin/StatCard";
import {
  Search, Loader2, Users, Repeat, DollarSign, ShieldCheck, ChevronDown,
  Mail, Phone, Download, UserCheck, Calendar,
} from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-500/15 text-green-400",
  pending:   "bg-yellow-500/15 text-yellow-400",
  cancelled: "bg-red-500/15 text-red-400",
  completed: "bg-[#FCC300]/15 text-[#FCC300]",
  no_show:   "bg-orange-500/15 text-orange-400",
};

const MILITARY_LABELS: Record<string, string> = {
  approved: "Military verified",
  pending: "Military pending",
  rejected: "Military denied",
};

interface Booking {
  id: string;
  confirmation: string;
  status: string;
  pax: number;
  roundTrip: boolean;
  totalCents: number;
  date: string | null;   // YYYY-MM-DD of the first leg
  time: string | null;
  route: string;
  bookedAt: string;
}

interface CustomerProfile {
  id: string;
  name: string;
  email: string;         // "" for walk-ins without one
  phone: string;
  hasAccount: boolean;
  military: string;
  smsConsent: boolean;
  since: string;
  bookings: Booking[];   // newest trip first
  activeBookings: number; // not cancelled
  completed: number;
  spentCents: number;    // non-cancelled totals (fare − discount + tip)
  lastTrip: string | null;
  nextTrip: string | null;
}

type SortKey = "recent" | "bookings" | "spent" | "name";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Latest trip" },
  { key: "bookings", label: "Most bookings" },
  { key: "spent", label: "Top spend" },
  { key: "name", label: "Name A–Z" },
];

const PAGE = 1000;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function loadProfiles(): Promise<CustomerProfile[]> {
  const supabase = createClient() as any;
  const rows: any[] = [];
  // Supabase caps a select at 1,000 rows — page through.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, first_name, last_name, email, phone, user_id, military_status, created_at, " +
        "reservations(id, confirmation_number, status, adults, children, is_round_trip, total_cents, " +
        "sms_consent, created_at, deleted_at, trip:trips!reservations_trip_id_fkey(departure_date, departure_time, route:routes(name)))"
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const today = localDateString();
  return rows
    .map((c): CustomerProfile => {
      const live = (c.reservations ?? []).filter((r: any) => !r.deleted_at);
      const bookings: Booking[] = live
        .map((r: any) => ({
          id: r.id,
          confirmation: r.confirmation_number,
          status: r.status,
          pax: (r.adults ?? 0) + (r.children ?? 0),
          roundTrip: r.is_round_trip,
          totalCents: r.total_cents ?? 0,
          date: r.trip?.departure_date ?? null,
          time: r.trip?.departure_time ?? null,
          route: r.trip?.route?.name ?? "—",
          bookedAt: r.created_at,
        }))
        .sort((a: Booking, b: Booking) => (b.date ?? "").localeCompare(a.date ?? ""));
      const active = bookings.filter((b) => b.status !== "cancelled");
      const past = active.filter((b) => b.date && b.date < today).map((b) => b.date!);
      const upcoming = active.filter((b) => b.date && b.date >= today).map((b) => b.date!).sort();
      // Walk-ins without an email get a placeholder address — don't show it.
      const email = /@walkin\.volt$/i.test(c.email ?? "") ? "" : c.email ?? "";
      return {
        id: c.id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—",
        email,
        phone: c.phone ?? "",
        hasAccount: !!c.user_id,
        military: c.military_status ?? "none",
        smsConsent: live.some((r: any) => r.sms_consent),
        since: c.created_at,
        bookings,
        activeBookings: active.length,
        completed: bookings.filter((b) => b.status === "completed").length,
        spentCents: active.reduce((s, b) => s + b.totalCents, 0),
        lastTrip: past.length ? past.sort().at(-1)! : null,
        nextTrip: upcoming[0] ?? null,
      };
    })
    // Only people who have actually booked.
    .filter((p) => p.bookings.length > 0);
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(profiles: CustomerProfile[]) {
  const header = ["Name", "Email", "Phone", "Bookings", "Completed", "Total spent", "Last trip", "Next trip", "Customer since", "Military", "Text alerts", "Account"];
  const lines = profiles.map((p) => [
    p.name, p.email, p.phone, p.activeBookings, p.completed, (p.spentCents / 100).toFixed(2),
    p.lastTrip ?? "", p.nextTrip ?? "", p.since.slice(0, 10), p.military, p.smsConsent ? "Yes" : "No", p.hasAccount ? "Yes" : "Guest",
  ].map(csvCell).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `volt-customers-${localDateString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CustomersPage() {
  const [profiles, setProfiles] = useState<CustomerProfile[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfiles()
      .then((p) => { if (!cancelled) setProfiles(p); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = (profiles ?? []).filter((p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (digits.length >= 3 && p.phone.replace(/\D/g, "").includes(digits)) ||
      p.bookings.some((b) => b.confirmation.toLowerCase().includes(q))
    );
    const lastOrNext = (p: CustomerProfile) => p.nextTrip ?? p.lastTrip ?? "";
    return [...list].sort((a, b) =>
      sort === "bookings" ? b.activeBookings - a.activeBookings :
      sort === "spent" ? b.spentCents - a.spentCents :
      sort === "name" ? a.name.localeCompare(b.name) :
      lastOrNext(b).localeCompare(lastOrNext(a))
    );
  }, [profiles, query, sort]);

  const all = profiles ?? [];
  const repeat = all.filter((p) => p.activeBookings > 1).length;
  const lifetime = all.reduce((s, p) => s + p.spentCents, 0);
  const military = all.filter((p) => p.military === "approved").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">Everyone who has ever booked a ride with Volt.</p>
        </div>
        <Button
          onClick={() => downloadCsv(shown)}
          disabled={!profiles || shown.length === 0}
          variant="outline"
          className="border-white/15 text-white hover:bg-white/5"
        >
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Customers" value={!profiles ? "…" : all.length} icon={Users} accent />
        <StatCard label="Repeat Riders" value={!profiles ? "…" : repeat} sub={profiles && all.length ? `${Math.round((repeat / all.length) * 100)}% booked more than once` : undefined} icon={Repeat} />
        <StatCard label="Lifetime Bookings Value" value={!profiles ? "…" : formatCents(lifetime)} sub="Excludes cancelled bookings" icon={DollarSign} />
        <StatCard label="Military Verified" value={!profiles ? "…" : military} icon={ShieldCheck} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, or confirmation number…"
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-11 rounded-xl focus:border-[#FCC300]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sort === s.key ? "bg-[#FCC300] text-[#0A0A0A]" : "glass text-[#A1A1AA] hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/8 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
              <div className="col-span-3">Customer</div>
              <div className="col-span-3">Contact</div>
              <div className="col-span-1 text-center">Bookings</div>
              <div className="col-span-2 text-right">Total Spent</div>
              <div className="col-span-2">Last / Next Trip</div>
              <div className="col-span-1" />
            </div>

            {error ? (
              <p className="px-5 py-16 text-center text-red-400 text-sm sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-none">{error}</p>
            ) : !profiles ? (
              <div className="flex justify-center py-16 sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
                <Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" />
              </div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center sticky left-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
                <Users className="w-8 h-8 text-[#A1A1AA] mb-3" />
                <p className="text-white font-medium mb-1">No customers found</p>
                <p className="text-[#A1A1AA] text-sm">
                  {all.length === 0 ? "Customers appear here after their first booking." : "Try a different search."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {shown.map((p) => {
                  const open = openId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <button
                        onClick={() => setOpenId(open ? null : p.id)}
                        aria-expanded={open}
                        className="w-full grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center text-left"
                      >
                        <div className="col-span-3 min-w-0">
                          <div className="text-white font-medium text-sm truncate">{p.name}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.activeBookings > 1 && <Tag className="bg-[#FCC300]/15 text-[#FCC300]">Repeat</Tag>}
                            {MILITARY_LABELS[p.military] && <Tag className="bg-green-500/15 text-green-400">{MILITARY_LABELS[p.military]}</Tag>}
                            {p.hasAccount && <Tag className="bg-white/8 text-[#A1A1AA]">Account</Tag>}
                          </div>
                        </div>
                        <div className="col-span-3 min-w-0">
                          <div className="text-white text-sm">{p.phone || "—"}</div>
                          <div className="text-[#A1A1AA] text-xs truncate">{p.email || "No email"}</div>
                        </div>
                        <div className="col-span-1 text-center text-white text-sm">{p.activeBookings}</div>
                        <div className="col-span-2 text-right text-white font-semibold text-sm">{formatCents(p.spentCents)}</div>
                        <div className="col-span-2 text-xs">
                          <div className="text-[#A1A1AA]">Last: <span className="text-white">{p.lastTrip ? formatDateShort(p.lastTrip) : "—"}</span></div>
                          {p.nextTrip && <div className="text-green-400">Next: {formatDateShort(p.nextTrip)}</div>}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <ChevronDown className={`w-4 h-4 text-[#A1A1AA] transition-transform ${open ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {open && <CustomerDetail profile={p} />}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {profiles && (
        <p className="text-[#A1A1AA] text-sm">Showing {shown.length} of {all.length} customers</p>
      )}
    </div>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${className}`}>{children}</span>;
}

function CustomerDetail({ profile: p }: { profile: CustomerProfile }) {
  return (
    <div className="bg-white/[0.02] px-5 py-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-2 text-sm">
        <h3 className="text-white font-semibold mb-2">Profile</h3>
        {p.phone && (
          <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white">
            <Phone className="w-3.5 h-3.5" /> {p.phone}
          </a>
        )}
        {p.email && (
          <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white break-all">
            <Mail className="w-3.5 h-3.5 shrink-0" /> {p.email}
          </a>
        )}
        <div className="flex items-center gap-2 text-[#A1A1AA]">
          <Calendar className="w-3.5 h-3.5" /> Customer since {when(p.since)}
        </div>
        <div className="flex items-center gap-2 text-[#A1A1AA]">
          <UserCheck className="w-3.5 h-3.5" /> {p.hasAccount ? "Has an online account" : "Books as a guest"}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-xs">
          <dt className="text-[#A1A1AA]">Completed rides</dt><dd className="text-white">{p.completed}</dd>
          <dt className="text-[#A1A1AA]">Cancelled</dt><dd className="text-white">{p.bookings.length - p.activeBookings}</dd>
          <dt className="text-[#A1A1AA]">Text alerts</dt><dd className="text-white">{p.smsConsent ? "Opted in" : "No"}</dd>
          <dt className="text-[#A1A1AA]">Military</dt><dd className="text-white">{MILITARY_LABELS[p.military] ?? "—"}</dd>
        </dl>
      </div>

      <div className="lg:col-span-2">
        <h3 className="text-white font-semibold text-sm mb-2">Booking history</h3>
        <ul className="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
          {p.bookings.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/reservations/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-white/5 transition-colors text-sm">
                <span className="text-[#FCC300] text-xs font-mono w-24">{b.confirmation}</span>
                <span className="text-white flex-1 min-w-[10rem]">
                  {b.route}{b.roundTrip ? " · Round trip" : ""}
                </span>
                <span className="text-[#A1A1AA] text-xs">
                  {b.date ? formatDateShort(b.date) : "—"}{b.time ? ` · ${formatTime12h(b.time)}` : ""}
                </span>
                <span className="text-[#A1A1AA] text-xs flex items-center gap-1"><Users className="w-3 h-3" />{b.pax}</span>
                <span className="text-white text-xs font-semibold w-16 text-right">{formatCents(b.totalCents)}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[b.status] ?? ""}`}>
                  {b.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
