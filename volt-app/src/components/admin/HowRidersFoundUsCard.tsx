"use client";

// Reports → "How riders found us": answers to the optional checkout question
// (reservations.heard_from, src/lib/heard-from.ts) for online bookings made
// in the selected period, plus everything typed under "Other".

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCents, formatDateShort, localDateString } from "@/lib/format";
import { HEARD_FROM_OPTIONS } from "@/lib/heard-from";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Row {
  id: string;
  confirmation_number: string;
  heard_from: string | null;
  heard_from_other: string | null;
  total_cents: number;
  created_at: string;
}

const NO_ANSWER = "none";

export default function HowRidersFoundUsCard({ days }: { days: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadedDays, setLoadedDays] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const loading = loadedDays !== days;

  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    (async () => {
      const sb = createClient() as any;
      // Online checkout only — staff and walk-in bookings never see the question.
      const { data, error: err } = await sb
        .from("reservations")
        .select("id, confirmation_number, heard_from, heard_from_other, total_cents, created_at")
        .eq("terms_acceptance", "online")
        .neq("status", "cancelled")
        .gte("created_at", `${localDateString(start)}T00:00:00`)
        .order("created_at", { ascending: false });
      setError(!!err);
      setRows(data ?? []);
      setLoadedDays(days);
    })();
  }, [days]);

  const { buckets, answered, others } = useMemo(() => {
    const options = [...HEARD_FROM_OPTIONS, { value: NO_ANSWER, label: "No answer" }];
    const buckets = options.map((o) => {
      const matching = rows.filter((r) => (r.heard_from ?? NO_ANSWER) === o.value);
      return {
        value: o.value,
        label: o.label,
        bookings: matching.length,
        revenue: matching.reduce((s, r) => s + (r.total_cents ?? 0), 0),
      };
    });
    return {
      buckets,
      answered: rows.filter((r) => r.heard_from).length,
      others: rows.filter((r) => r.heard_from === "other" && r.heard_from_other),
    };
  }, [rows]);

  const maxBookings = Math.max(1, ...buckets.map((b) => b.bookings));
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/8 flex items-center gap-2.5">
        <Megaphone className="w-5 h-5 text-[#FCC300] flex-shrink-0" />
        <div>
          <h2 className="text-white font-bold text-lg">How Riders Found Us</h2>
          <p className="text-[#A1A1AA] text-xs">
            Online bookings made in the last {days} days (not cancelled). The question is optional, so
            some riders skip it.{!loading && !error && rows.length > 0 && ` ${answered} of ${rows.length} answered.`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : error ? (
        <p className="px-6 py-8 text-center text-[#A1A1AA] text-sm">
          These answers can&apos;t be loaded yet — the database hasn&apos;t been updated for this question.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-8 text-center text-[#A1A1AA] text-sm">No online bookings in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_5rem_5rem_6rem] gap-x-4 px-4 sm:px-6 py-2.5 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
            <div>Answer</div>
            <div className="text-right">Bookings</div>
            <div className="text-right hidden sm:block">Share</div>
            <div className="text-right">Revenue</div>
          </div>
          <div className="divide-y divide-white/6">
            {buckets.map((b) => (
              <div key={b.value} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_5rem_5rem_6rem] gap-x-4 px-4 sm:px-6 py-3 items-center">
                <div className="min-w-0">
                  <div className={`text-sm ${b.value === NO_ANSWER ? "text-[#A1A1AA]" : "text-white"}`}>{b.label}</div>
                  <div className="h-1.5 mt-1.5 rounded-full bg-white/6 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.value === NO_ANSWER ? "bg-white/20" : "bg-[#FCC300]"}`}
                      style={{ width: `${(b.bookings / maxBookings) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right text-white font-semibold text-sm">{b.bookings}</div>
                <div className="text-right text-[#A1A1AA] text-sm hidden sm:block">{pct(b.bookings)}%</div>
                <div className="text-right text-white text-sm">{formatCents(b.revenue)}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/8 px-4 sm:px-6 py-4">
            <h3 className="text-white font-semibold text-sm mb-2">What riders wrote under &ldquo;Other&rdquo;</h3>
            {others.length === 0 ? (
              <p className="text-[#A1A1AA] text-xs">Nothing typed in this period.</p>
            ) : (
              <ul className="space-y-2">
                {others.map((r) => (
                  <li key={r.id} className="text-sm flex flex-wrap items-baseline gap-x-2">
                    <span className="text-white">&ldquo;{r.heard_from_other}&rdquo;</span>
                    <span className="text-[#A1A1AA] text-xs">
                      {formatDateShort(r.created_at.slice(0, 10))} ·{" "}
                      <Link href={`/dashboard/reservations/${r.id}`} className="text-[#FCC300] hover:underline">
                        {r.confirmation_number}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
