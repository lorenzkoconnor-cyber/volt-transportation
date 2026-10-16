// ─── App settings — server loader ─────────────────────────────────────────────
// getAppSettings() reads booking_settings + the live website banner, cached
// for a few seconds per server process so busy pages don't hit the database
// on every request. Saving settings (/api/settings) clears the cache.
// Calling it from a page/layout opts that page into per-request rendering,
// so a changed price or phone number shows on the site right away.

import { connection } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/url";
import { settingsFromRow, DEFAULT_SETTINGS, type AppSettings, type Announcement } from "@/lib/settings";

const TTL_MS = 15_000;
// Kept on globalThis so API routes and pages (bundled separately) share one
// cache — a save that clears it updates the website immediately.
const g = globalThis as unknown as { __voltSettingsCache?: { at: number; value: AppSettings } | null };
const cacheGet = () => g.__voltSettingsCache ?? null;
const cacheSet = (v: { at: number; value: AppSettings } | null) => { g.__voltSettingsCache = v; };

function db() {
  return createSupabaseClient(getSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function invalidateSettingsCache() {
  cacheSet(null);
}

/** Settings for server code that isn't rendering a page (API routes, worker). */
export async function loadAppSettings(): Promise<AppSettings> {
  const cache = cacheGet();
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const sb = db();
    const nowIso = new Date().toISOString();
    const [{ data: row }, { data: banners }, { data: routes }] = await Promise.all([
      sb.from("booking_settings").select("*").maybeSingle(),
      sb.from("site_announcements")
        .select("id, message, link_url, link_label, starts_at, ends_at")
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(1),
      sb.from("routes")
        .select("origin_key, first_departure_time, last_departure_time, departure_interval_minutes, duration_minutes")
        .eq("is_active", true),
    ]);
    const b = banners?.[0];
    const announcement: Announcement | null = b
      ? { id: b.id, message: b.message, linkUrl: b.link_url, linkLabel: b.link_label }
      : null;
    const value = settingsFromRow(row, announcement, routes ?? []);
    cacheSet({ at: Date.now(), value });
    return value;
  } catch (err) {
    console.error("[settings] could not load — using defaults", err);
    return cacheGet()?.value ?? DEFAULT_SETTINGS;
  }
}

/** Settings for a page or layout (renders per request). */
export async function getAppSettings(): Promise<AppSettings> {
  await connection();
  return loadAppSettings();
}
