"use client";

// Settings → Schedule & Service → Driver Trips & ATL Pickups (migration 040).
import { useState } from "react";
import { MapPin, Loader2, Camera } from "lucide-react";
import { FieldsCard } from "@/components/admin/settings/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SPOTS = [
  { terminal: "Domestic – South", column: "atl_spot_domestic_south", label: "Domestic South" },
  { terminal: "Domestic – North", column: "atl_spot_domestic_north", label: "Domestic North" },
  { terminal: "International (Concourse F)", column: "atl_spot_international", label: "International" },
];

export function DriverTripsCard({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  return (
    <FieldsCard icon={MapPin} title="Driver Trips & ATL Pickups" settings={settings} onSaved={onSaved}
      description="Drivers run their own trips from My Trips. Riders are texted the pickup spot for their terminal when the driver taps Arrived, and see it on their tracking page."
      rows={[
        { column: "atl_wait_minutes", title: "Driver can mark a no-show after", suffix: "minutes at the stop" },
        { column: "atl_wait_max_minutes", title: "Office is alerted after", suffix: "minutes at the stop · riders are told the van waits this long" },
        { column: "driver_max_shift_hours", title: "Driver shift limit", suffix: "hours · drivers and the live board get a warning",
          help: "Check Georgia's rules for commercial passenger drivers and set this to match." },
        ...SPOTS.map((s) => ({ column: s.column, title: `Pickup spot: ${s.label}`, help: "Where commercial shuttles load at this terminal, in words a rider can follow." })),
      ]}>
      {() => (
        <div className="space-y-2">
          <div className="text-white text-sm font-medium">Pickup spot photos</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SPOTS.map((s) => <SpotPhoto key={s.column} label={s.label} terminal={s.terminal} url={settings[`${s.column}_photo`]} onSaved={onSaved} />)}
          </div>
        </div>
      )}
    </FieldsCard>
  );
}

function SpotPhoto({ label, terminal, url, onSaved }: { label: string; terminal: string; url: string | null; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", "spot"); fd.append("terminal", terminal);
    const res = await fetch("/api/driver-runs/photo", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error ?? "Upload failed.");
    else onSaved();
    setBusy(false);
  };
  return (
    <label className="block rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={`${label} pickup spot`} className="w-full h-28 object-cover" />
        : <div className="h-28 flex items-center justify-center text-[#71717A]"><Camera className="w-6 h-6" /></div>}
      <div className="px-3 py-2 text-xs text-[#A1A1AA] flex items-center justify-between">
        <span>{label}</span>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-[#FCC300]">{url ? "Replace" : "Add photo"}</span>}
      </div>
      {err && <p className="px-3 pb-2 text-red-400 text-xs">{err}</p>}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
    </label>
  );
}
