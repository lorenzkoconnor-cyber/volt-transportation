// Run: npm test
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { captureAttribution, normalizeAttribution, readAttribution, sourceFromReferrer } from "../src/lib/attribution.ts";

const HOST = "www.volt-transportation.com";
const KEY = "volt-attribution-v1";
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

test("referring sites are named by source and medium", () => {
  assert.deepEqual(sourceFromReferrer("https://www.google.com/", HOST), { source: "google", medium: "organic" });
  assert.deepEqual(sourceFromReferrer("https://www.google.co.uk/", HOST), { source: "google", medium: "organic" });
  assert.deepEqual(sourceFromReferrer("android-app://com.google.android.googlequicksearchbox/", HOST), { source: "google", medium: "organic" });
  assert.deepEqual(sourceFromReferrer("https://www.bing.com/search", HOST), { source: "bing", medium: "organic" });
  assert.deepEqual(sourceFromReferrer("https://lm.facebook.com/", HOST), { source: "facebook", medium: "social" });
  assert.deepEqual(sourceFromReferrer("https://l.instagram.com/", HOST), { source: "instagram", medium: "social" });
  assert.deepEqual(sourceFromReferrer("https://www.wtvm.com/news/story?id=1", HOST), { source: "wtvm.com", medium: "referral" });
});

test("our own site, payment pages, sign-in and blank referrers are ignored", () => {
  assert.equal(sourceFromReferrer("", HOST), null);
  assert.equal(sourceFromReferrer("not a url", HOST), null);
  assert.equal(sourceFromReferrer("https://www.volt-transportation.com/book", HOST), null);
  assert.equal(sourceFromReferrer("https://volt-transportation.com/", HOST), null);
  assert.equal(sourceFromReferrer("https://hooks.stripe.com/3d", HOST), null);
  assert.equal(sourceFromReferrer("https://accounts.google.com/", HOST), null);
});

test("a referring site is saved without its full address", () => {
  captureAttribution("/", "", "https://www.google.com/search?q=private+words", HOST);
  assert.deepEqual(readAttribution(), { utmSource: "google", utmMedium: "organic", utmCampaign: "", utmContent: "", landingPath: "/" });
  assert.ok(!store.get(KEY)!.includes("private"));
});

test("a Facebook click ID is credited to Facebook, not called paid", () => {
  captureAttribution("/lp/x", "?fbclid=abc123", "", HOST);
  assert.deepEqual(readAttribution(), { utmSource: "facebook", utmMedium: "social", utmCampaign: "", utmContent: "", landingPath: "/lp/x" });
});

test("utm tags and Google click IDs still win over everything", () => {
  captureAttribution("/", "", "https://www.google.com/", HOST);
  captureAttribution("/lp/a", "?utm_source=facebook&utm_medium=paid_social&utm_campaign=c&utm_content=d&fbclid=z", "https://l.facebook.com/", HOST);
  assert.equal(readAttribution()?.utmMedium, "paid_social");
  captureAttribution("/book", "?gclid=1", "", HOST);
  assert.equal(readAttribution()?.utmSource, "google");
  assert.equal(readAttribution()?.utmMedium, "cpc");
});

test("a later plain visit never replaces a current ad tag", () => {
  captureAttribution("/lp/a", "?utm_source=facebook&utm_medium=paid_social", "", HOST);
  captureAttribution("/", "", "https://www.google.com/", HOST);
  captureAttribution("/", "?fbclid=x", "", HOST);
  assert.equal(readAttribution()?.utmMedium, "paid_social");
  assert.equal(readAttribution()?.landingPath, "/lp/a");
});

test("an ad tag saved before this change is still protected", () => {
  store.set(KEY, JSON.stringify({ utmSource: "google", utmMedium: "cpc", utmCampaign: "1", utmContent: "2", landingPath: "/", savedAt: Date.now() }));
  captureAttribution("/", "", "https://www.bing.com/", HOST);
  assert.equal(readAttribution()?.utmMedium, "cpc");
});

test("the newest plain source replaces an older plain source", () => {
  captureAttribution("/", "", "https://www.bing.com/", HOST);
  captureAttribution("/pricing", "", "https://www.google.com/", HOST);
  assert.equal(readAttribution()?.utmSource, "google");
  assert.equal(readAttribution()?.landingPath, "/pricing");
});

test("moving between pages keeps the page the visitor landed on", () => {
  captureAttribution("/about", "", "https://www.google.com/", HOST);
  captureAttribution("/book", "", "https://www.google.com/", HOST);
  assert.equal(readAttribution()?.landingPath, "/about");
});

test("a direct visit saves nothing", () => {
  captureAttribution("/", "", "", HOST);
  assert.equal(readAttribution(), null);
  assert.equal(store.size, 0);
});

test("anything older than 30 days is forgotten and can be replaced", () => {
  const old = Date.now() - 31 * 24 * 60 * 60_000;
  store.set(KEY, JSON.stringify({ utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "", utmContent: "", landingPath: "/", savedAt: old }));
  assert.equal(readAttribution(), null);
  captureAttribution("/", "", "https://www.google.com/", HOST);
  assert.equal(readAttribution()?.utmMedium, "organic");
});

test("internal bookkeeping fields never reach checkout", () => {
  captureAttribution("/", "", "https://www.google.com/", HOST);
  const sent = readAttribution() as unknown as Record<string, unknown>;
  assert.equal("savedAt" in sent, false);
  assert.equal("plain" in sent, false);
  assert.deepEqual(normalizeAttribution(sent), sent);
});
