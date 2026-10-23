import { metaInitiateCheckout, metaPageView, metaPurchase, setMetaPixelEnabled } from "@/lib/meta-pixel";

// Google Analytics 4 (Google tag). Page views are sent by hand from
// <GoogleTag /> so staff pages are never tracked and private bits of a URL
// (receipt tokens, emails, sign-in codes) never reach Google.
// Never put names, emails, phone numbers or flight details in an event.

export const GA_ID = "G-KX85S245EN";

// Staff-only and sign-in screens: no analytics at all.
const UNTRACKED_PREFIXES = ["/dashboard", "/emp-login", "/auth"];

export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Only ad/campaign attribution params survive; everything else is dropped.
const KEPT_PARAMS = /^(utm_[a-z_]+|gclid|gbraid|wbraid|dclid|srsltid)$/;

export function cleanPagePath(pathname: string, search: string): string {
  const path = pathname.startsWith("/receipt/") ? "/receipt" : pathname;
  const kept = new URLSearchParams();
  new URLSearchParams(search).forEach((value, key) => {
    if (KEPT_PARAMS.test(key)) kept.append(key, value);
  });
  const qs = kept.toString();
  return qs ? `${path}?${qs}` : path;
}

type Gtag = (command: "event" | "config" | "js" | "set", ...args: unknown[]) => void;

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

// Sets up the standard gtag() queue and config once. Calls made before
// Google's script has downloaded wait in dataLayer and are sent in order.
export function initGtag() {
  if (typeof window === "undefined") return;
  const w = window as GtagWindow;
  if (w.gtag) return;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    // gtag.js expects the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA_ID, { send_page_view: false });
}

// Google's own off switch: while set, the tag sends nothing at all.
// Also switches the Meta Pixel (meta-pixel.ts) on/off for the same pages.
export function setTrackingEnabled(enabled: boolean) {
  setMetaPixelEnabled(enabled);
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !enabled;
}

function gtag(...args: Parameters<Gtag>) {
  if (typeof window === "undefined") return;
  initGtag();
  (window as GtagWindow).gtag!(...args);
}

// The previous page, cleaned the same way, so the referrer never carries a
// private URL either. Also skips repeat sends of the same page.
let lastLocation: string | null = null;

export function trackPageView(pathname: string, search: string) {
  const path = cleanPagePath(pathname, search);
  const location = `${window.location.origin}${path}`;
  if (location === lastLocation) return;
  const external = document.referrer && !document.referrer.startsWith(window.location.origin);
  gtag("event", "page_view", {
    page_path: path,
    page_location: location,
    page_referrer: lastLocation ?? (external ? document.referrer : ""),
    page_title: document.title,
  });
  metaPageView();
  lastLocation = location;
}

export interface TripItem {
  route: string;      // e.g. "Columbus → ATL"
  roundTrip: boolean;
  riders: number;
}

function items(trip: TripItem, value: number) {
  return [{
    item_id: trip.roundTrip ? "round_trip" : "one_way",
    item_name: `${trip.route} ${trip.roundTrip ? "(Round Trip)" : "(One Way)"}`,
    item_category: "Shuttle",
    price: value,
    quantity: 1,
  }];
}

export function trackBeginCheckout(trip: TripItem, value: number) {
  gtag("event", "begin_checkout", { currency: "USD", value, items: items(trip, value), riders: trip.riders });
  metaInitiateCheckout(value, trip.riders);
}

export function trackPurchase(confirmationNumber: string, trip: TripItem, value: number) {
  gtag("event", "purchase", {
    transaction_id: confirmationNumber,
    currency: "USD",
    value,
    items: items(trip, value),
    riders: trip.riders,
  });
  metaPurchase(confirmationNumber, value, trip.riders);
}
