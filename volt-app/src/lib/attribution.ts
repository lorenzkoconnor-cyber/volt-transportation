// Which ad, campaign or website brought a rider to the site, so a booking can
// be credited to it (e.g. Facebook A/B test version A vs B, or Google search).
// Kept in this browser only: saved when a visitor lands from a tagged link,
// a click ID or another website, sent with checkout, and stored on the
// reservation. Holds only the site's name, never the full address it came
// from or anything personal.
//
// A tagged link (utm_* or a Google Ads click ID) always wins. A plain source
// (Facebook click ID or referring website) never replaces a tagged link that
// is still current. Everything expires after 30 days.

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

// Google Ads auto-tags clicks with a click ID instead of utm_* tags, so an
// untagged ad click is still credited to Google.
const GOOGLE_CLICK_IDS = ["gclid", "gbraid", "wbraid"];

type Saved = Attribution & { savedAt: number; plain?: boolean };
type Touch = { source: string; medium: string };

const FACEBOOK: Touch = { source: "facebook", medium: "social" };
const INSTAGRAM: Touch = { source: "instagram", medium: "social" };

// Payment and sign-in pages send visitors back to us; they didn't bring them.
const IGNORED_REFERRERS = /(^|\.)(stripe\.com|stripecdn\.com|accounts\.google\.com)$/;

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

export function sourceFromReferrer(referrer: string, ownHost: string): Touch | null {
  let host: string;
  try {
    host = bareHost(new URL(referrer).hostname);
  } catch {
    return null;
  }
  if (!host || host === bareHost(ownHost) || IGNORED_REFERRERS.test(host)) return null;
  if (/^google\.[a-z.]+$/.test(host) || host === "com.google.android.googlequicksearchbox") {
    return { source: "google", medium: "organic" };
  }
  const search = host.match(/(?:^|\.)(bing|duckduckgo|yahoo|brave|ecosia)\.[a-z.]+$/);
  if (search) return { source: search[1], medium: "organic" };
  if (/(^|\.)facebook\.com$/.test(host)) return FACEBOOK;
  if (/(^|\.)instagram\.com$/.test(host)) return INSTAGRAM;
  return { source: host, medium: "referral" };
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (!saved.savedAt || Date.now() - saved.savedAt > MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

function save(value: Saved) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function captureAttribution(pathname: string, search: string, referrer = "", ownHost = "") {
  const params = new URLSearchParams(search);
  const landingPath = clean(pathname, 200);
  const googleClick = GOOGLE_CLICK_IDS.some((k) => params.has(k));
  const tagged = params.get("utm_source") || (googleClick ? "google" : null);
  if (tagged) {
    save({
      utmSource: clean(tagged),
      utmMedium: clean(params.get("utm_medium") || (googleClick ? "cpc" : "")),
      utmCampaign: clean(params.get("utm_campaign")),
      utmContent: clean(params.get("utm_content")),
      landingPath,
      savedAt: Date.now(),
    });
    return;
  }

  // Facebook adds fbclid to ads and ordinary posts alike, so it can't be
  // called a paid click.
  const touch = params.has("fbclid") ? FACEBOOK : sourceFromReferrer(referrer, ownHost);
  if (!touch) return;
  // document.referrer stays the same as a visitor moves between pages, so the
  // same-source check also keeps the page they first landed on.
  const saved = readSaved();
  if (saved && (!saved.plain || saved.utmSource === touch.source)) return;
  save({
    utmSource: clean(touch.source),
    utmMedium: touch.medium,
    utmCampaign: "",
    utmContent: "",
    landingPath,
    savedAt: Date.now(),
    plain: true,
  });
}

export function readAttribution(): Attribution | null {
  return normalizeAttribution(readSaved());
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
