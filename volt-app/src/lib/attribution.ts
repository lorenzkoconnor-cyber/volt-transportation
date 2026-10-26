// Which ad or campaign brought a rider to the site, so a booking can be
// credited to it (e.g. Facebook A/B test version A vs B). Kept in this
// browser only: saved when a visitor lands on a URL with utm_* tags, sent with
// checkout, and stored on the reservation. Never holds anything personal.
//
// Last tagged visit wins, and it expires after 30 days.

const STORAGE_KEY = "volt-attribution-v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export interface Attribution {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  landingPath: string;
}

const clean = (v: unknown, max = 100) =>
  String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9_.\-/ ]/g, "").slice(0, max);

export function captureAttribution(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const source = params.get("utm_source");
  if (!source) return;
  const value: Attribution & { savedAt: number } = {
    utmSource: clean(source),
    utmMedium: clean(params.get("utm_medium")),
    utmCampaign: clean(params.get("utm_campaign")),
    utmContent: clean(params.get("utm_content")),
    landingPath: clean(pathname, 200),
    savedAt: Date.now(),
  };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function readAttribution(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { savedAt, ...rest } = JSON.parse(raw) as Attribution & { savedAt: number };
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) return null;
    return rest;
  } catch {
    return null;
  }
}

// Server side: accept only the expected short strings from the browser.
export function normalizeAttribution(v: unknown): Attribution | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const out: Attribution = {
    utmSource: clean(a.utmSource),
    utmMedium: clean(a.utmMedium),
    utmCampaign: clean(a.utmCampaign),
    utmContent: clean(a.utmContent),
    landingPath: clean(a.landingPath, 200),
  };
  return out.utmSource ? out : null;
}
