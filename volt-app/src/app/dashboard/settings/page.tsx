"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatDuration, displayTime12h } from "@/lib/booking";
import { Settings, Loader2, Save, Plane, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RouteRow {
  id: string;
  name: string;
  origin_key: string;
  duration_minutes: number;
}

interface Windows {
  depart_min_buffer_minutes: number;
  depart_max_buffer_minutes: number;
  arrive_min_wait_minutes: number;
  arrive_max_wait_minutes: number;
}

const inputClass =
  "w-24 h-10 rounded-lg bg-white/5 border border-white/10 text-white px-3 text-sm text-right focus:outline-none focus:border-[#7C3AED] transition-colors";

// "10:30" minus N minutes → "08:45" (negative N adds)
function minusMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function SettingsPage() {
  const supabase = createClient();
  const sb = supabase as any;
  const { employee } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [windows, setWindows] = useState<Windows | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [routeRes, settingsRes] = await Promise.all([
      sb.from("routes").select("id, name, origin_key, duration_minutes").eq("is_active", true).order("origin_key", { ascending: false }),
      sb.from("booking_settings").select("*").maybeSingle(),
    ]);
    setRoutes(routeRes.data ?? []);
    setWindows(settingsRes.data ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const setRouteMinutes = (id: string, v: number) =>
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, duration_minutes: v } : r)));
  const setWindow = (key: keyof Windows, v: number) =>
    setWindows((prev) => (prev ? { ...prev, [key]: v } : prev));

  const validationError = (): string => {
    for (const r of routes) {
      if (!Number.isInteger(r.duration_minutes) || r.duration_minutes < 30 || r.duration_minutes > 300)
        return "Route time must be a whole number of minutes between 30 and 300.";
    }
    if (!windows) return "";
    const vals = Object.values(windows).filter((v) => typeof v === "number") as number[];
    if (vals.some((v) => !Number.isInteger(v) || v < 0 || v > 720)) return "Flight windows must be between 0 and 720 minutes.";
    if (windows.depart_max_buffer_minutes <= windows.depart_min_buffer_minutes)
      return "For departing flights, the latest arrival must be more than the earliest.";
    if (windows.arrive_max_wait_minutes <= windows.arrive_min_wait_minutes)
      return "For arriving flights, the longest wait must be more than the shortest.";
    return "";
  };

  const save = async () => {
    const problem = validationError();
    if (problem) { setToast({ kind: "err", msg: problem }); return; }
    setSaving(true);
    try {
      // .select() so an RLS-blocked update (0 rows) surfaces as an error.
      for (const r of routes) {
        const { data, error } = await sb.from("routes")
          .update({ duration_minutes: r.duration_minutes }).eq("id", r.id).select("id");
        if (error || !data?.length) throw new Error("You don't have permission to change route times.");
      }
      if (windows) {
        const { data, error } = await sb.from("booking_settings")
          .update({
            depart_min_buffer_minutes: windows.depart_min_buffer_minutes,
            depart_max_buffer_minutes: windows.depart_max_buffer_minutes,
            arrive_min_wait_minutes: windows.arrive_min_wait_minutes,
            arrive_max_wait_minutes: windows.arrive_max_wait_minutes,
            updated_by: employee?.id ?? null,
          })
          .eq("id", true)
          .select("id");
        if (error || !data?.length) throw new Error("You don't have permission to change booking settings.");
      }
      setToast({ kind: "ok", msg: "Settings saved. New bookings use them right away." });
    } catch (err) {
      setToast({ kind: "err", msg: err instanceof Error ? err.message : "Could not save settings." });
    }
    setSaving(false);
  };

  // Live example: a 7:00 AM departure for a 10:30 AM flight.
  const toAtl = routes.find((r) => r.origin_key !== "atl");
  const exampleArrival = toAtl ? minusMinutes("07:00", -toAtl.duration_minutes) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#7C3AED]" />
          Settings
        </h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          Timing the booking flow uses to match Volt departures to customers&apos; flights.
        </p>
      </div>

      {toast && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 border ${
          toast.kind === "ok" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {toast.kind === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
          <p className="text-sm">{toast.msg}</p>
        </div>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" />
        </div>
      ) : (
        <>
          {/* Route time */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#7C3AED]" /> Scheduled Route Time
              </h2>
              <p className="text-[#A1A1AA] text-xs mt-1">
                How long Volt plans for the drive, used to estimate arrival times. Standard is 105 min
                (Apple Maps&apos; ~1 hr 30 min plus a 15-min operational buffer). Refine it with real trip data.
              </p>
            </div>
            {routes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4">
                <span className="text-white text-sm">{r.name}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={30} max={300} step={5}
                    value={r.duration_minutes}
                    onChange={(e) => setRouteMinutes(r.id, Number(e.target.value))}
                    className={inputClass}
                  />
                  <span className="text-[#A1A1AA] text-xs w-24">min · {formatDuration(r.duration_minutes || 0)}</span>
                </div>
              </div>
            ))}
            {toAtl && exampleArrival && toAtl.duration_minutes < 210 && (
              <p className="text-[#C4B5FD] text-xs bg-[#7C3AED]/10 rounded-lg px-3 py-2">
                Example: 10:30 AM flight → 7:00 AM Volt departure → {displayTime12h(exampleArrival)} ATL arrival →{" "}
                {formatDuration(210 - toAtl.duration_minutes)} before the flight
              </p>
            )}
          </div>

          {/* Flight windows */}
          {windows && (
            <div className="glass rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Plane className="w-4 h-4 text-[#7C3AED]" /> Flight Matching Windows
                </h2>
                <p className="text-[#A1A1AA] text-xs mt-1">
                  Which departures customers are offered when they book with a flight.
                </p>
              </div>

              <WindowRow
                title="Flying out of ATL"
                help="Offer shuttles that reach ATL between these many minutes before the flight."
                minLabel="At least" maxLabel="At most"
                min={windows.depart_min_buffer_minutes}
                max={windows.depart_max_buffer_minutes}
                onMin={(v) => setWindow("depart_min_buffer_minutes", v)}
                onMax={(v) => setWindow("depart_max_buffer_minutes", v)}
                suffix="before flight"
              />
              <WindowRow
                title="Landing at ATL"
                help="Offer shuttles leaving ATL between these many minutes after the flight lands."
                minLabel="At least" maxLabel="At most"
                min={windows.arrive_min_wait_minutes}
                max={windows.arrive_max_wait_minutes}
                onMin={(v) => setWindow("arrive_min_wait_minutes", v)}
                onMax={(v) => setWindow("arrive_max_wait_minutes", v)}
                suffix="after landing"
              />
            </div>
          )}

          <Button
            disabled={saving}
            onClick={save}
            className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </>
      )}
    </div>
  );
}

function WindowRow({
  title, help, minLabel, maxLabel, min, max, onMin, onMax, suffix,
}: {
  title: string; help: string; minLabel: string; maxLabel: string;
  min: number; max: number; onMin: (v: number) => void; onMax: (v: number) => void; suffix: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-white text-sm font-medium">{title}</div>
        <div className="text-[#A1A1AA] text-xs">{help}</div>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-sm text-[#A1A1AA]">
        <span>{minLabel}</span>
        <input type="number" min={0} max={720} step={5} value={min}
          onChange={(e) => onMin(Number(e.target.value))} className={inputClass} />
        <span>min, {maxLabel.toLowerCase()}</span>
        <input type="number" min={0} max={720} step={5} value={max}
          onChange={(e) => onMax(Number(e.target.value))} className={inputClass} />
        <span>min {suffix}</span>
      </div>
    </div>
  );
}
