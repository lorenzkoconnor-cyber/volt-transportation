"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h, formatDateLong } from "@/lib/format";
import {
  ArrowLeft, Phone, CheckCircle2, XCircle, UserX, MapPin,
  MessageSquare, Loader2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type PassengerStatus = "boarded" | "no_show";

interface Passenger {
  id: string;
  name: string;
  phone: string;
  isPrimary: boolean;
  isBoarded: boolean;
  isNoShow: boolean;
  notes: string;
  confirmation: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ManifestContent() {
  const params = useSearchParams();
  const tripId = params.get("tripId");
  const supabase = createClient();
  const sb = supabase as any;

  const [trip, setTrip] = useState<any>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tripId) { setLoading(false); return; }

    const [tripRes, paxRes] = await Promise.all([
      sb.from("trips")
        .select("id, departure_date, departure_time, status, seats_booked, total_capacity, route:routes(name)")
        .eq("id", tripId)
        .single(),
      sb.from("reservation_passengers")
        .select(
          "id, name, is_primary, is_boarded, is_no_show, " +
          "reservation:reservations!inner(id, confirmation_number, special_notes, status, trip_id, " +
          "customer:customers(phone))"
        )
        .eq("reservation.trip_id", tripId)
        .neq("reservation.status", "cancelled"),
    ]);

    setTrip(tripRes.data ?? null);
    setPassengers(
      (paxRes.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        phone: p.reservation?.customer?.phone ?? "",
        isPrimary: p.is_primary,
        isBoarded: p.is_boarded,
        isNoShow: p.is_no_show,
        notes: p.is_primary ? (p.reservation?.special_notes ?? "") : "",
        confirmation: p.reservation?.confirmation_number ?? "",
      }))
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (id: string, status: PassengerStatus) => {
    const p = passengers.find((x) => x.id === id);
    if (!p) return;

    const next = {
      is_boarded: status === "boarded" ? !p.isBoarded : false,
      is_no_show: status === "no_show" ? !p.isNoShow : false,
    };

    // Optimistic update, revert on failure
    setPassengers((prev) =>
      prev.map((x) => (x.id === id ? { ...x, isBoarded: next.is_boarded, isNoShow: next.is_no_show } : x))
    );
    const { error: err } = await sb.from("reservation_passengers").update(next).eq("id", id);
    if (err) {
      setError("Couldn't save boarding status — check your connection.");
      await load();
    }
  };

  const markAllBoarded = async () => {
    setBusy(true);
    setError("");
    const ids = passengers.filter((p) => !p.isNoShow).map((p) => p.id);
    const { error: err } = await sb
      .from("reservation_passengers")
      .update({ is_boarded: true })
      .in("id", ids);
    if (err) setError(err.message);
    await load();
    setBusy(false);
  };

  const setTripStatus = async (status: string) => {
    setBusy(true);
    setError("");
    const { error: err } = await sb.from("trips").update({ status }).eq("id", tripId);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  const boardedCount = passengers.filter((p) => p.isBoarded).length;
  const noShowCount  = passengers.filter((p) => p.isNoShow).length;
  const waitingCount = passengers.filter((p) => !p.isBoarded && !p.isNoShow).length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
      </div>
    );
  }

  if (!tripId || !trip) {
    return (
      <div className="flex flex-col items-center py-24 gap-3">
        <AlertCircle className="w-10 h-10 text-[#A1A1AA]" />
        <p className="text-white font-semibold">Trip not found</p>
        <p className="text-[#A1A1AA] text-sm">Open a manifest from the Dispatch page.</p>
        <Link href="/dashboard/dispatch" className="text-[#7C3AED] hover:underline text-sm">← Back to dispatch</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/dispatch">
          <button className="w-9 h-9 rounded-xl glass flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Passenger Manifest</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {formatTime12h(trip.departure_time)} · {trip.route?.name} · {formatDateLong(trip.departure_date)} · {passengers.length} passenger{passengers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Boarded", count: boardedCount, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Waiting", count: waitingCount, icon: UserX,        color: "text-yellow-400", bg: "bg-yellow-500/10" },
          { label: "No Show", count: noShowCount,  icon: XCircle,      color: "text-red-400",   bg: "bg-red-500/10" },
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
          {passengers.length > 0 && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={markAllBoarded}
              className="text-[#7C3AED] hover:text-[#9D5FF5] text-xs">
              Mark All Boarded
            </Button>
          )}
        </div>
        {passengers.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-2">
            <UserX className="w-8 h-8 text-[#A1A1AA]" />
            <p className="text-[#A1A1AA] text-sm">No passengers booked on this trip yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {passengers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-5 py-4 transition-colors flex-wrap gap-3 ${
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
                      <span className="text-[#A1A1AA] text-xs font-mono">{p.confirmation}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[#A1A1AA] text-xs flex-wrap">
                      {p.phone && (
                        <a href={`tel:${p.phone}`} className="flex items-center gap-1 hover:text-white transition-colors">
                          <Phone className="w-3 h-3" />{p.phone}
                        </a>
                      )}
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
                    No Show
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trip status actions */}
      <div className="glass rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-white font-semibold">
            {trip.status === "completed" ? "Trip completed" :
             trip.status === "in_progress" ? "Trip in progress" :
             "Ready to depart?"}
          </div>
          <div className="text-[#A1A1AA] text-sm">{boardedCount} of {passengers.length} passengers boarded</div>
        </div>
        <div className="flex items-center gap-2">
          {trip.status === "scheduled" || trip.status === "boarding" ? (
            <Button disabled={busy} onClick={() => setTripStatus("in_progress")}
              className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
              <MapPin className="w-4 h-4 mr-2" />
              Mark Trip Departed
            </Button>
          ) : trip.status === "in_progress" ? (
            <Button disabled={busy} onClick={() => setTripStatus("completed")}
              className="bg-green-600 hover:bg-green-500 text-white font-semibold">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark Trip Completed
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Completed
            </span>
          )}
        </div>
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
