"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { localDateString } from "@/lib/format";
import { Plus, Phone, Mail, CheckCircle2, XCircle, X, Loader2, AlertCircle, Trash2, Camera, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DriverForm {
  id?: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  is_active: boolean;
}

const EMPTY_FORM: DriverForm = {
  first_name: "", last_name: "", phone: "", email: "", is_active: true,
};

export default function DriversPage() {
  const supabase = createClient();
  const sb = supabase as any;
  const { isOwner } = useAuth();

  const [drivers, setDrivers] = useState<any[]>([]);
  const [tripCounts, setTripCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<DriverForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logins, setLogins] = useState<any[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from("drivers")
      .select("*")
      .order("created_at");
    if (err) setError(err.message);
    setDrivers(data ?? []);
    // Driver-role logins, to connect each driver profile to the person who signs in (My Trips).
    const { data: emps } = await sb.from("employees").select("id, first_name, last_name, email").eq("role", "driver").eq("is_active", true);
    setLogins(emps ?? []);

    // Trips assigned this week per driver
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const { data: assignments } = await sb
      .from("trip_vehicles")
      .select("driver_id, trip:trips!inner(departure_date)")
      .gte("trip.departure_date", localDateString(weekStart))
      .not("driver_id", "is", null);

    const counts: Record<string, number> = {};
    (assignments ?? []).forEach((a: any) => {
      if (a.driver_id) counts[a.driver_id] = (counts[a.driver_id] ?? 0) + 1;
    });
    setTripCounts(counts);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (driver?: any) => {
    setConfirmDelete(false);
    setFormError("");
    setForm(driver
      ? {
          id: driver.id,
          first_name: driver.first_name,
          last_name: driver.last_name,
          phone: driver.phone,
          email: driver.email ?? "",
          is_active: driver.is_active,
        }
      : { ...EMPTY_FORM });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError("");

    const record = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      is_active: form.is_active,
    };

    const { error: err } = form.id
      ? await sb.from("drivers").update(record).eq("id", form.id)
      : await sb.from("drivers").insert(record);

    if (err) {
      setFormError(err.message.includes("row-level security")
        ? "Only the owner or a manager can manage drivers."
        : err.message);
    } else {
      setForm(null);
      await load();
    }
    setSaving(false);
  };

  const toggleActive = async (driver: any) => {
    const { error: err } = await sb
      .from("drivers")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);
    if (err) setError(err.message);
    else await load();
  };

  const deleteDriver = async () => {
    if (!form?.id) return;
    setDeleting(true);
    setFormError("");
    // Driver assignments (trip_vehicles.driver_id) are ON DELETE SET NULL, so
    // deleting a driver simply un-assigns them from any trips — no records lost.
    const { error: err } = await sb.from("drivers").delete().eq("id", form.id);
    if (err) {
      setFormError(err.message.includes("row-level security")
        ? "Only the owner or a manager can delete drivers."
        : err.message);
      setDeleting(false);
      return;
    }
    setForm(null);
    setConfirmDelete(false);
    setDeleting(false);
    await load();
  };

  const inputCls = "bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/40 h-10 rounded-xl focus:border-[#FCC300]";

  const uploadPhoto = async (driverId: string, file: File | undefined) => {
    if (!file) return;
    setUploading(driverId);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "driver");
    fd.append("driverId", driverId);
    const res = await fetch("/api/driver-runs/photo", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "Upload failed.");
    await load();
    setUploading(null);
  };

  const linkLogin = async (driverId: string, employeeId: string) => {
    setError("");
    if (employeeId) await sb.from("drivers").update({ employee_id: null }).eq("employee_id", employeeId);
    const { error: err } = await sb.from("drivers").update({ employee_id: employeeId || null }).eq("id", driverId);
    if (err) setError(err.message);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Drivers</h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            {loading ? "Loading…" : `${drivers.filter(d => d.is_active).length} active driver${drivers.filter(d => d.is_active).length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => openForm()}
          className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
          <Plus className="w-4 h-4 mr-1.5" /> Add Driver
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
          <Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {drivers.map((d) => (
            <div key={d.id} className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-white/8">
                <div className="flex items-center gap-3">
                  <label className="relative w-12 h-12 rounded-full bg-[#FCC300]/20 flex items-center justify-center text-white font-bold cursor-pointer overflow-hidden group" title="Upload photo (riders see it on their tracking page)">
                    {d.photo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={d.photo_url} alt="" className="w-full h-full object-cover" />
                      : <>{d.first_name[0]}{d.last_name[0]}</>}
                    <span className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center">
                      {uploading === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      onChange={(e) => uploadPhoto(d.id, e.target.files?.[0])} />
                  </label>
                  <div>
                    <div className="text-white font-bold">{d.first_name} {d.last_name}</div>
                    <div className="text-[#A1A1AA] text-xs">Driver</div>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${d.is_active ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {d.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {d.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/3 rounded-lg p-3">
                    <div className="text-[#A1A1AA] text-xs mb-0.5">Trips This Week</div>
                    <div className="text-white text-sm font-bold">{tripCounts[d.id] ?? 0}</div>
                  </div>
                  <div className="bg-white/3 rounded-lg p-3">
                    <div className="text-[#A1A1AA] text-xs mb-0.5">Notes</div>
                    <div className="text-white text-sm font-medium truncate">{d.notes || "—"}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {d.phone && (
                    <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white text-sm transition-colors">
                      <Phone className="w-3.5 h-3.5 text-[#FCC300]" />{d.phone}
                    </a>
                  )}
                  {d.email && (
                    <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white text-sm transition-colors truncate">
                      <Mail className="w-3.5 h-3.5 text-[#FCC300]" />{d.email}
                    </a>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[#A1A1AA] text-xs flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-[#FCC300]" /> Signs in to My Trips as</div>
                  <select value={d.employee_id ?? ""} onChange={(e) => linkLogin(d.id, e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-[#FCC300]">
                    <option value="" className="bg-[#171717]">Not connected</option>
                    {logins.map((e) => (
                      <option key={e.id} value={e.id} className="bg-[#171717]">{e.first_name} {e.last_name} ({e.email})</option>
                    ))}
                  </select>
                  {!d.photo_url && <p className="text-[#71717A] text-xs">Tap the initials to add a photo. Riders see it when you&apos;re on the way.</p>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openForm(d)}
                    className="flex-1 border-white/15 text-white hover:bg-white/5 text-xs">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(d)}
                    className="flex-1 border-white/15 text-[#A1A1AA] hover:bg-white/5 text-xs">
                    {d.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => openForm()}
            className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border-dashed border-white/15 hover:border-[#FCC300]/40 transition-all group min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-[#FCC300]/15 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-[#A1A1AA] group-hover:text-[#FCC300] transition-colors" />
            </div>
            <span className="text-[#A1A1AA] group-hover:text-white text-sm transition-colors">Add New Driver</span>
          </button>
        </div>
      )}

      {/* Add/Edit modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setForm(null)} />
          <div className="relative w-full max-w-md glass rounded-2xl p-7 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">{form.id ? "Edit Driver" : "Add Driver"}</h2>
              <button onClick={() => setForm(null)} className="text-[#A1A1AA] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">First Name *</Label>
                  <Input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="Marcus" className={inputCls} />
                </div>
                <div>
                  <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Last Name *</Label>
                  <Input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Johnson" className={inputCls} />
                </div>
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Phone *</Label>
                <Input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(706) 555-0000" className={inputCls} />
              </div>
              <div>
                <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Email (optional)</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="driver@email.com" className={inputCls} />
              </div>
              <p className="text-[#A1A1AA] text-xs">
                Drivers are assigned to a vehicle per trip in Dispatch, so no fixed vehicle or license
                is stored here. To give this driver dashboard access (boarding lists, trips), also create an
                employee account for them on the Employees page with the &quot;Driver&quot; role.
              </p>

              {formError && (
                <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{formError}</p>
              )}

              <Button type="submit" disabled={saving}
                className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-11 rounded-xl disabled:opacity-60">
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  : form.id ? "Save Changes" : "Add Driver"}
              </Button>
            </form>

            {/* Owner-only delete */}
            {form.id && isOwner && (
              <div className="mt-5 pt-5 border-t border-white/10">
                {confirmDelete ? (
                  <div className="space-y-3">
                    <p className="text-[#A1A1AA] text-xs">
                      Permanently delete this driver? They&apos;ll be removed from any trips they&apos;re
                      assigned to (those trips keep their vehicle, just no driver). This can&apos;t be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" disabled={deleting} onClick={deleteDriver}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold h-9 rounded-lg">
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, Delete Driver"}
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
                    <Trash2 className="w-3.5 h-3.5" /> Delete driver
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
