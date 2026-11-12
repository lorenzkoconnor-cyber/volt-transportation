"use client";

// New Reservation → "Find a saved customer". Type a name, phone or email to
// pull up someone who has booked before and fill in their details. Works for
// every staff role (employees can read customers — RLS customers_employee_read),
// so office staff don't need the Customers page.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldCheck, UserCheck, X } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SavedCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;          // "" for walk-ins booked without one
  militaryVerified: boolean;
}

// Walk-ins without an email get a placeholder address — never show or reuse it.
export const realEmail = (email: string | null | undefined) =>
  /@(walkin|guest)\.volt$/i.test(email ?? "") ? "" : email ?? "";

export function toSavedCustomer(c: any): SavedCustomer {
  return {
    id: c.id,
    firstName: c.first_name ?? "",
    lastName: c.last_name ?? "",
    phone: c.phone ?? "",
    email: realEmail(c.email),
    militaryVerified: c.military_status === "approved",
  };
}

export const CUSTOMER_FIELDS = "id, first_name, last_name, email, phone, military_status, created_at";

async function searchCustomers(q: string): Promise<SavedCustomer[]> {
  const words = q.toLowerCase().replace(/[,()%*\\]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const first = words[0];
  const digits = first.replace(/\D/g, "");
  // Phones may be stored formatted — "7065" matches "(706) 5…".
  const phonePattern = digits.length >= 3 ? `%${digits.split("").join("%")}%` : `%${first}%`;
  const supabase = createClient() as any;
  const { data } = await supabase
    .from("customers")
    .select(CUSTOMER_FIELDS)
    .or(`first_name.ilike.%${first}%,last_name.ilike.%${first}%,email.ilike.%${first}%,phone.ilike.${phonePattern}`)
    .order("created_at", { ascending: false })
    .limit(60);
  const rest = words.slice(1);
  return (data ?? [])
    .map(toSavedCustomer)
    .filter((c: SavedCustomer) => {
      const hay = `${c.firstName} ${c.lastName} ${c.email} ${c.phone.replace(/\D/g, "")}`.toLowerCase();
      // "706 555 0000" — number words match the phone's digits.
      return rest.every((w) => hay.includes(/^[\d.-]+$/.test(w) ? w.replace(/\D/g, "") : w));
    })
    .slice(0, 8);
}

export default function SavedCustomerPicker({ onPick }: { onPick: (c: SavedCustomer) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Search a moment after typing stops; only the latest search's answer counts.
  const change = (value: string) => {
    setQ(value);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    const n = ++seq.current;
    const query = value.trim();
    if (query.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(() => {
      searchCustomers(query)
        .then((r) => { if (n === seq.current) setResults(r); })
        .catch(() => { if (n === seq.current) setResults([]); })
        .finally(() => { if (n === seq.current) setLoading(false); });
    }, 250);
  };

  const pick = (c: SavedCustomer) => {
    onPick(c);
    change("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={q}
          placeholder="Find a saved customer — name, phone or email"
          aria-label="Find a saved customer"
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/60 h-10 rounded-xl focus:border-[#FCC300] pl-9 pr-9"
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading ? (
          <Loader2 className="w-4 h-4 text-[#A1A1AA] absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        ) : q && (
          <button type="button" aria-label="Clear search" onClick={() => change("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && q.trim().length >= 2 && !loading && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-[#141414] shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#A1A1AA]">No saved customer matches — type their details below.</div>
          ) : results.map((c) => (
            <button key={c.id} type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0">
              <UserCheck className="w-4 h-4 text-[#FCC300] flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="text-white text-sm font-medium flex items-center gap-1.5">
                  {`${c.firstName} ${c.lastName}`.trim() || "—"}
                  {c.militaryVerified && <ShieldCheck className="w-3.5 h-3.5 text-green-400" aria-label="Military verified" />}
                </span>
                <span className="text-[#A1A1AA] text-xs block truncate">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
