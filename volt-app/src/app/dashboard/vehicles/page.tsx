"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Car, Plus, CheckCircle2, Wrench, XCircle, X, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-green-500/15 text-green-400",
  maintenance: "bg-yellow-500/15 text-yellow-400",
  retired:     "bg-red-500/15 text-red-400",
};
const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  active: CheckCircle2, maintenance: Wrench, retired: XCircle,
};

/* eslint-disable @typescript-eslint/no-explicit-any */

interface VehicleForm {
  id?: string;
  name: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  capacity: number;
  status: string;
  notes: string;
}

const EMPTY_FORM: VehicleForm = {
  name: "", license_plate: "", make: "Mercedes", model: "Sprinter 2500",
  year: new Date().getFullYear(), capacity: 8, status: "active", notes: "",
};

export default function VehiclesPage() {
  const supabase = createClient();
  const sb = supabase as any;
  const { isOwner } = useAuth();

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("vehicles")
      .select("*")
      .order("created_at");
    if (err) setError(err.message);
    setVehicles(data ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError("");

    const record = {
      name: form.name.trim(),
      license_plate: form.license_plate.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year,
      capacity: form.capacity,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const { error: err } = form.id
      ? await sb.from("vehicles").update(record).eq("id", form.id)
      : await sb.from("vehicles").insert(record);

    if (err) {
      setFormError(err.message.includes("duplicate")
        ? "A vehicle with that license plate already exists."
        : err.message.includes("row-level security")
        ? "Only the owner or a manager can manage vehicles."
        : err.message);
    } else {
      setForm(null);
      await load();
    }
    setSaving(false);
  };

  const deleteVehicle = async () => {
    if (!form?.id) return;
    setDeleting(true);
    setFormError("");
    const { error: err } = await sb.from("vehicles").delete().eq("id", form.id);
    if (err) {
      // trip_vehicles.vehicle_id is ON DELETE RESTRICT, so a vehicle that's
      // assigned to any trip can't be deleted until those assignments are removed.
      const inUse = err.message.includes("foreign key") || err.code === "23503";
      setFormError(inUse
        ? "This vehicle is assigned to one or more trips. Remove it from those departures in Dispatch (or set it to Retired) before deleting."
        : err.message.includes("row-level security")
        ? "Only the owner or a manager can delete vehicles."
        : err.message);
      setDeleting(false);
      return;
    }
    setForm(null);
    setConfirmDelete(false);
    setDeleting(false);
    await load();
  };

  const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#7C3AED]";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehicles</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {loading ? "Loading…" : `${vehicles.filter(v => v.status === "active").length} active · ${vehicles.length} total`}
          </p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(""); setConfirmDelete(false); }}
          className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Vehicle
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-16 flex justify-center">
          <Loader2 className="w-8 h-8 text-[#7C3AED] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {vehicles.map((v) => {
            const Icon = STATUS_ICONS[v.status] ?? CheckCircle2;
            return (
              <div key={v.id} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-white/8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 flex items-center justify-center">
                      <Car className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <div>
                      <div className="text-white font-bold">{v.name}</div>
                      <div className="text-[#A1A1AA] text-xs font-mono">{v.license_plate}</div>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[v.status] ?? ""}`}>
                    <Icon className="w-3 h-3" />{v.status}
                  </span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Make / Model", value: `${v.make} ${v.model}` },
                      { label: "Year",         value: v.year },
                      { label: "Capacity",     value: `${v.capacity} passengers` },
                      { label: "Notes",        value: v.notes || "—" },
                    ].map((field) => (
                      <div key={field.label} className="bg-white/3 rounded-lg p-3">
                        <div className="text-[#A1A1AA] text-xs mb-0.5">{field.label}</div>
                        <div className="text-white text-sm font-medium truncate">{field.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="outline" size="sm"
                      onClick={() => { setForm({ ...v, notes: v.notes ?? "" }); setFormError(""); setConfirmDelete(false); }}
                      className="flex-1 border-white/15 text-white hover:bg-white/5 text-xs">
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add vehicle placeholder */}
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(""); setConfirmDelete(false); }}
            className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border-dashed border-white/15 hover:border-[#7C3AED]/40 transition-all group min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-[#7C3AED]/15 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-[#A1A1AA] group-hover:text-[#7C3AED] transition-colors" />
            </div>
            <span className="text-[#A1A1AA] group-hover:text-white text-sm transition-colors">Add New Vehicle</span>
          </button>
        </div>
      )}

      {/* Add/Edit modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="relative w-full max-w-md glass rounded-2xl p-7 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">{form.id ? "Edit Vehicle" : "Add Vehicle"}</h2>
              <button onClick={() => setForm(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Name *</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Sprinter 03" className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">License Plate *</Label>
                  <Input required value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
                    placeholder="VOLT-003" className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Make *</Label>
                  <Input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Model *</Label>
                  <Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Year *</Label>
                  <Input required type="number" min={1990} max={2100} value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value || "2024", 10) })}
                    className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Capacity *</Label>
                  <Input required type="number" min={1} max={64} value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Math.max(1, parseInt(e.target.value || "8", 10)) })}
                    className={inputCls} />
                </div>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Status *</Label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full h-10 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#7C3AED]">
                  <option value="active" className="bg-[#171717]">Active</option>
                  <option value="maintenance" className="bg-[#171717]">In Maintenance</option>
                  <option value="retired" className="bg-[#171717]">Retired</option>
                </select>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Service history, quirks…"
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 rounded-xl focus:border-[#7C3AED] min-h-[60px]" />
              </div>

              {formError && (
                <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{formError}</p>
              )}

              <Button type="submit" disabled={saving}
                className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold h-11 rounded-xl disabled:opacity-60">
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  : form.id ? "Save Changes" : "Add Vehicle"}
              </Button>
            </form>

            {/* Owner-only delete */}
            {form.id && isOwner && (
              <div className="mt-5 pt-5 border-t border-white/10">
                {confirmDelete ? (
                  <div className="space-y-3">
                    <p className="text-[#A1A1AA] text-xs">
                      Permanently delete this vehicle? This can&apos;t be undone. If it&apos;s assigned to any
                      trips you&apos;ll need to remove it from those first (or set it to Retired instead).
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" disabled={deleting} onClick={deleteVehicle}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold h-9 rounded-lg">
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Delete Vehicle"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}
                        className="flex-1 border-white/15 text-white hover:bg-white/5 text-xs h-9 rounded-lg">
                        Keep
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-red-400 hover:text-red-300 text-xs font-medium transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> Delete vehicle
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
