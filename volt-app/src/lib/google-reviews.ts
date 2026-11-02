// ─── Google reviews (server-only) ─────────────────────────────────────────────
// Volt's Google rating and reviews for the homepage, from the Places API (New).
// Google returns at most 5 reviews ("most relevant") plus the overall rating and
// count. Every review it returns is shown — never filter by star rating (FTC).
//
// Needs GOOGLE_PLACES_API_KEY (Google Cloud → Places API (New)). GOOGLE_PLACE_ID
// is optional: without it the place is looked up once by name and address.
// No key → null, and the homepage shows only reviews from Volt's own form.

const PLACE_QUERY = "Volt Transportation, 3885 Miller Rd Ste C, Columbus, GA 31909";
const CACHE_MS = 60 * 60_000; // ~720 lookups a month, inside Google's free tier

export interface GoogleReview {
  id: string;
  name: string;
  authorUrl: string | null;
  rating: number;
  body: string;
  createdAt: string;
}

export interface GoogleReviews {
  rating: number;
  count: number;
  url: string;
  reviews: GoogleReview[];
}

// Shared across separately bundled routes (see settings-server.ts).
const g = globalThis as unknown as {
  __voltGoogleReviews?: { at: number; value: GoogleReviews | null } | null;
  __voltGooglePlaceId?: string;
};

async function placeId(key: string): Promise<string | null> {
  const fixed = process.env.GOOGLE_PLACE_ID?.trim();
  if (fixed) return fixed;
  if (g.__voltGooglePlaceId) return g.__voltGooglePlaceId;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: PLACE_QUERY }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${await res.text()}`);
  const id = (await res.json()).places?.[0]?.id;
  if (typeof id !== "string") return null;
  g.__voltGooglePlaceId = id;
  return id;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchGoogleReviews(key: string): Promise<GoogleReviews | null> {
  const id = await placeId(key);
  if (!id) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`place details ${res.status}: ${await res.text()}`);
  const p = await res.json();
  if (typeof p.rating !== "number" || !p.userRatingCount) return null;
  return {
    rating: p.rating,
    count: p.userRatingCount,
    url: typeof p.googleMapsUri === "string" ? p.googleMapsUri : "https://www.google.com/maps/search/?api=1&query=Volt+Transportation+Columbus+GA",
    reviews: (p.reviews ?? [])
      .map((r: any): GoogleReview => ({
        id: `google-${r.name ?? r.publishTime}`,
        name: r.authorAttribution?.displayName ?? "Google user",
        authorUrl: r.authorAttribution?.uri ?? null,
        rating: Number(r.rating) || 0,
        body: (r.originalText?.text ?? r.text?.text ?? "").trim(),
        createdAt: r.publishTime ?? new Date().toISOString(),
      }))
      .filter((r: GoogleReview) => r.rating >= 1 && r.body),
  };
}

/** Volt's Google rating and reviews. Never throws — null hides the Google part. */
export async function getGoogleReviews(): Promise<GoogleReviews | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return null;
  const cached = g.__voltGoogleReviews;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const value = await fetchGoogleReviews(key);
    g.__voltGoogleReviews = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[google-reviews]", e);
    // Keep showing the last good result; retry in 5 minutes.
    g.__voltGoogleReviews = { at: Date.now() - CACHE_MS + 5 * 60_000, value: cached?.value ?? null };
    return cached?.value ?? null;
  }
}
