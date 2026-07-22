"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatTime12h, localDateString } from "@/lib/format";
import {
  Users, Truck, Clock, ChevronRight, CheckCircle2, AlertTriangle,
  Plus, Loader2, X, Trash2, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  scheduled:   { label: "Scheduled",    class: "bg-blue-500/15 text-blue-400" },
  boarding:    { label: "Boarding",     class: "bg-yellow-500/15 text-yellow-400" },
  in_progress: { label: "In Progress",  class: "bg-[#7C3AED]/15 text-[#7C3AED]" },
  completed:   { label: "Completed",    class: "bg-green-500/15 text-green-400" },
  cancelled:   { label: "Cancelled",    class: "bg-red-500/15 text-red-400" },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function DispatchPage() {
  const supabase = createClient();
  const sb = supabase as any;
  const { isOwner } = useAuth();

  const [date, setDate] = useState(localDateString());
  const [deleteTrip, setDeleteTrip] = useState<any>(null);
  const [deleteError, setDeleteError] = useState("");
  const [trips, setTrips] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Add-trip modal
  const [showAdd, setShowAdd] = useState(false);
  const [addRouteId, setAddRouteId] = useState("");
  const [addTime, setAddTime] = useState("08:00");
  const [addCapacity, setAddCapacity] = useState(8);

  // Edit-trip modal
  const [editTrip, setEditTrip] = useState<any>(null);
  const [editTime, setEditTime] = useState("08:00");
  const [editCapacity, setEditCapacity] = useState(8);
  const [editError, setEditError] = useState("");

  // Assign-vehicle modal
  const [assignTrip, setAssignTrip] = useState<any>(null);
  const [assignVehicleId, setAssignVehicleId] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [tripsRes, routesRes, vehiclesRes, driversRes] = await Promise.all([
      sb.from("trips")
        .select(
          "id, route_id, departure_time, total_capacity, seats_booked, status, notes, " +
          "route:routes(name), " +
          "trip_vehicles(id, vehicle_id, driver_id, vehicle:vehicles(name, capacity), driver:drivers(first_name, last_name))"
        )
        .eq("departure_date", date)
        .order("departure_time"),
      sb.from("routes").select("id, name").eq("is_active", true),
      sb.from("vehicles").select("id, name, capacity, status").eq("status", "active"),
      sb.from("drivers").select("id, first_name, last_name").eq("is_active", true),
    ]);
    setTrips(tripsRes.data ?? []);
    setRoutes(routesRes.data ?? []);
    if (routesRes.data?.length && !addRouteId) setAddRouteId(routesRes.data[0].id);
    setVehicles(vehiclesRes.data ?? []);
    setDrivers(driversRes.data ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const visible = showEmpty ? trips : trips.filter((t) => t.seats_booked > 0 || (t.trip_vehicles ?? []).length > 0);
  const totalPassengers = trips.reduce((s, t) => s + t.seats_booked, 0);
  const completedTrips = trips.filter((t) => t.status === "completed").length;
  const bookedTrips = trips.filter((t) => t.seats_booked > 0).length;

  const addTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await sb.from("trips").insert({
      route_id: addRouteId,
      departure_date: date,
      departure_time: addTime,
      total_capacity: addCapacity,
      seats_booked: 0,
      status: "scheduled",
    });
    if (err) setError(err.message);
    else { setShowAdd(false); await load(); }
    setBusy(false);
  };

  const updateTripStatus = async (tripId: string, status: string) => {
    setBusy(true);
    setError("");
    const { error: err } = await sb.from("trips").update({ status }).eq("id", tripId);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  const openEdit = (trip: any) => {
    setEditTrip(trip);
    setEditTime(trip.departure_time.slice(0, 5));
    setEditCapacity(trip.total_capacity);
    setEditError("");
  };

  const saveEditTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTrip) return;
    if (editCapacity < editTrip.seats_booked) {
      setEditError(`Capacity can't be below the ${editTrip.seats_booked} seats already booked.`);
      return;
    }
    setBusy(true);
    setEditError("");
    const { error: err } = await sb
      .from("trips")
      .update({ departure_time: editTime, total_capacity: editCapacity })
      .eq("id", editTrip.id);
    if (err) setEditError(err.message);
    else { setEditTrip(null); await load(); }
    setBusy(false);
  };

  const confirmDeleteTrip = async () => {
    if (!deleteTrip) return;
    setBusy(true);
    setDeleteError("");
    // reservations.trip_id -> trips is ON DELETE RESTRICT, so a departure with
    // bookings can't be deleted. trip_vehicles cascade away automatically.
    const { error: err } = await sb.from("trips").delete().eq("id", deleteTrip.id);
    if (err) {
      const hasBookings = err.message.includes("foreign key") || err.code === "23503";
      setDeleteError(hasBookings
        ? "This departure has bookings. Cancel or move those reservations first, then delete it."
        : err.message.includes("row-level security")
        ? "Only the owner can delete departures."
        : err.message);
      setBusy(false);
      return;
    }
    setDeleteTrip(null);
    setBusy(false);
    await load();
  };

  const assignVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTrip || !assignVehicleId) return;
    setBusy(true);
    setError("");
    const { error: err } = await sb.from("trip_vehicles").insert({
      trip_id: assignTrip.id,
      vehicle_id: assignVehicleId,
      driver_id: assignDriverId || null,
    });
    if (err) setError(err.message.includes("duplicate") ? "That vehicle is already assigned to this trip." : err.message);
    else { setAssignTrip(null); await load(); }
    setBusy(false);
  };

  const removeAssignment = async (assignmentId: string) => {
    setBusy(true);
    const { error: err } = await sb.from("trip_vehicles").delete().eq("id", assignmentId);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  const changeAssignmentDriver = async (assignmentId: string, driverId: string) => {
    setBusy(true);
    const { error: err } = await sb.from("trip_vehicles").update({ driver_id: driverId || null }).eq("id", assignmentId);
    if (err) setError(err.message);
    else await load();
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispatch</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {loading ? "Loading…" : `${totalPassengers} passengers · ${completedTrips}/${bookedTrips || trips.length} trips completed`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]"
          />
          <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
              className="w-4 h-4 accent-[#7C3AED]"
            />
            Show empty departures
          </label>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}
            className="border-white/15 text-white hover:bg-white/5">
            <Plus className="w-4 h-4 mr-1" /> Add Trip
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Dispatch cards */}
      {loading ? (
        <div className="glass rounded-2xl p-16 flex justify-center">
          <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Truck className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
          <p className="text-white font-medium mb-1">
            {trips.length === 0 ? "No departures scheduled for this date" : "No booked departures for this date"}
          </p>
          <p className="text-[#A1A1AA] text-sm">
            {trips.length === 0
              ? "Use “Add Trip” to schedule one."
              : "Check “Show empty departures” to see all scheduled slots."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((dep) => {
            const statusInfo = STATUS_MAP[dep.status] ?? STATUS_MAP.scheduled;
            const assignments = dep.trip_vehicles ?? [];
            const hasNoDriver = assignments.some((a: any) => !a.driver) ||
              (dep.seats_booked > 0 && assignments.length === 0);

            return (
              <div key={dep.id} className="glass rounded-2xl overflow-hidden">
                {/* Trip header */}
                <div className="flex items-center justify-between p-5 border-b border-white/8 flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-white font-bold text-lg">{formatTime12h(dep.departure_time)}</span>
                        <span className="text-[#A1A1AA] text-sm">{dep.route?.name}</span>
                        {hasNoDriver && dep.status !== "cancelled" && (
                          <span className="flex items-center gap-1 text-yellow-400 text-xs">
                            <AlertTriangle className="w-3 h-3" /> {assignments.length === 0 ? "No vehicle assigned" : "No driver assigned"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[#A1A1AA] text-xs flex-wrap">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{dep.seats_booked}/{dep.total_capacity} seats</span>
                        <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{assignments.length} vehicle{assignments.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                    {/* Edit trip */}
                    <button
                      onClick={() => openEdit(dep)}
                      disabled={busy}
                      title="Edit time / capacity"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* Delete trip (owner only) */}
                    {isOwner && (
                      <button
                        onClick={() => { setDeleteTrip(dep); setDeleteError(""); }}
                        disabled={busy}
                        title="Delete departure"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Status selector */}
                    <select
                      value={dep.status}
                      disabled={busy}
                      onChange={(e) => updateTripStatus(dep.id, e.target.value)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1.5 border-0 focus:outline-none cursor-pointer ${statusInfo.class} bg-transparent`}
                      style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                    >
                      {Object.entries(STATUS_MAP).map(([key, info]) => (
                        <option key={key} value={key} className="bg-[#171717] text-white">{info.label}</option>
                      ))}
                    </select>
                    {dep.seats_booked > 0 && (
                      <Link href={`/admin/manifest?tripId=${dep.id}`}>
                        <span className="flex items-center gap-1 text-[#7C3AED] hover:text-[#9D5FF5] text-xs font-medium transition-colors cursor-pointer">
                          Manifest <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Vehicle assignments */}
                {assignments.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {assignments.map((a: any, vIdx: number) => (
                      <div key={a.id} className="flex items-center justify-between px-5 py-3 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-[#A1A1AA] text-xs w-16">Vehicle {vIdx + 1}</span>
                          <span className="text-white text-sm font-medium">{a.vehicle?.name ?? "—"}</span>
                          <select
                            value={a.driver_id ?? ""}
                            disabled={busy}
                            onChange={(e) => changeAssignmentDriver(a.id, e.target.value)}
                            className="bg-white/5 border border-white/10 text-[#A1A1AA] text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#7C3AED]"
                          >
                            <option value="" className="bg-[#171717]">No driver</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id} className="bg-[#171717]">
                                {d.first_name} {d.last_name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${dep.seats_booked >= dep.total_capacity ? "bg-red-400" : "bg-[#7C3AED]"}`}
                                style={{ width: `${Math.min(100, (dep.seats_booked / dep.total_capacity) * 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs ${dep.seats_booked >= dep.total_capacity ? "text-red-400" : "text-[#A1A1AA]"}`}>
                              {dep.seats_booked}/{dep.total_capacity}
                            </span>
                          </div>
                          <button
                            onClick={() => removeAssignment(a.id)}
                            disabled={busy}
                            className="text-[#A1A1AA] hover:text-red-400 transition-colors"
                            title="Remove vehicle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="px-5 py-2.5">
                      <button
                        onClick={() => { setAssignTrip(dep); setAssignVehicleId(vehicles[0]?.id ?? ""); setAssignDriverId(""); }}
                        className="flex items-center gap-1 text-[#7C3AED] hover:text-[#9D5FF5] text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add another vehicle
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-3 flex items-center justify-between">
                    <span className="text-[#A1A1AA] text-sm italic">
                      {dep.seats_booked > 0 ? `${dep.seats_booked} passengers · No vehicle assigned` : "No passengers booked · No vehicles assigned"}
                    </span>
                    <Button variant="ghost" size="sm" disabled={busy}
                      onClick={() => { setAssignTrip(dep); setAssignVehicleId(vehicles[0]?.id ?? ""); setAssignDriverId(""); }}
                      className="text-[#7C3AED] hover:text-[#9D5FF5] hover:bg-[#7C3AED]/10 text-xs">
                      Assign Vehicle
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Trip modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Add Trip</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">{date}</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={addTrip} className="space-y-4">
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Route *</Label>
                <select value={addRouteId} onChange={(e) => setAddRouteId(e.target.value)}
                  className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]">
                  {routes.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#171717]">{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Departure Time *</Label>
                  <input type="time" required value={addTime} onChange={(e) => setAddTime(e.target.value)}
                    className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]" />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Capacity *</Label>
                  <Input type="number" required min={1} max={64} value={addCapacity}
                    onChange={(e) => setAddCapacity(Math.max(1, parseInt(e.target.value || "8", 10)))}
                    className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#7C3AED]" />
                </div>
              </div>
              <Button type="submit" disabled={busy}
                className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1.5" />Add Trip</>}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Trip modal */}
      {editTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditTrip(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Edit Trip</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">{editTrip.route?.name} · {date}</p>
              </div>
              <button onClick={() => setEditTrip(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveEditTrip} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Departure Time *</Label>
                  <input type="time" required value={editTime} onChange={(e) => setEditTime(e.target.value)}
                    className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]" />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Capacity *</Label>
                  <Input type="number" required min={1} max={64} value={editCapacity}
                    onChange={(e) => setEditCapacity(Math.max(1, parseInt(e.target.value || "8", 10)))}
                    className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#7C3AED]" />
                </div>
              </div>
              {editTrip.seats_booked > 0 && (
                <p className="text-[#A1A1AA] text-xs">{editTrip.seats_booked} seat{editTrip.seats_booked !== 1 ? "s" : ""} already booked on this trip.</p>
              )}
              {editError && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{editError}</p>}
              <Button type="submit" disabled={busy}
                className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Trip confirmation modal */}
      {deleteTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteTrip(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">Delete Departure</h2>
              <button onClick={() => setDeleteTrip(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[#A1A1AA] text-sm mb-2">
              Delete the <span className="text-white font-medium">{formatTime12h(deleteTrip.departure_time)}</span>{" "}
              {deleteTrip.route?.name} departure on {date}?
            </p>
            {deleteTrip.seats_booked > 0 ? (
              <p className="text-yellow-400/90 text-xs bg-yellow-500/10 rounded-lg px-3 py-2 mb-4">
                This departure has {deleteTrip.seats_booked} booked seat{deleteTrip.seats_booked !== 1 ? "s" : ""}.
                You&apos;ll need to cancel those reservations first — deletion will be blocked otherwise.
              </p>
            ) : (
              <p className="text-[#A1A1AA] text-xs mb-4">This can&apos;t be undone.</p>
            )}
            {deleteError && (
              <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={confirmDeleteTrip}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold h-10 rounded-lg text-sm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4 mr-1.5" />Delete Departure</>}
              </Button>
              <Button variant="outline" onClick={() => setDeleteTrip(null)}
                className="flex-1 border-white/15 text-white hover:bg-white/5 h-10 rounded-lg text-sm">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Vehicle modal */}
      {assignTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAssignTrip(null)} />
          <div className="relative w-full max-w-sm glass rounded-2xl p-7 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-white font-bold text-lg">Assign Vehicle</h2>
                <p className="text-[#A1A1AA] text-xs mt-0.5">
                  {formatTime12h(assignTrip.departure_time)} · {assignTrip.route?.name}
                </p>
              </div>
              <button onClick={() => setAssignTrip(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {vehicles.length === 0 ? (
              <p className="text-[#A1A1AA] text-sm">
                No active vehicles. Add one on the{" "}
                <Link href="/admin/vehicles" className="text-[#7C3AED] hover:underline">Vehicles</Link> page first.
              </p>
            ) : (
              <form onSubmit={assignVehicle} className="space-y-4">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Vehicle *</Label>
                  <select value={assignVehicleId} onChange={(e) => setAssignVehicleId(e.target.value)}
                    className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]">
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#171717]">
                        {v.name} ({v.capacity} seats)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Driver</Label>
                  <select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}
                    className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]">
                    <option value="" className="bg-[#171717]">Assign later</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id} className="bg-[#171717]">
                        {d.first_name} {d.last_name}
                      </option>
                    ))}
                  </select>
                  {drivers.length === 0 && (
                    <p className="text-[#A1A1AA] text-xs mt-1.5">
                      No drivers yet — add them on the{" "}
                      <Link href="/admin/drivers" className="text-[#7C3AED] hover:underline">Drivers</Link> page.
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={busy}
                  className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" />Assign</>}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
