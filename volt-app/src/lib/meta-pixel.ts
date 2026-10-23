// Meta (Facebook/Instagram) Pixel. Same rules as Google Analytics in
// analytics.ts: no staff pages, no localhost, and never names, emails, phone
// numbers or flight details in an event. Calls go through analytics.ts, so
// every page view / checkout / purchase reaches both tools.

// "Volt Website Pixel" dataset in the Volt Transportation business portfolio
// (Events Manager). Empty = Pixel switched off.
export const META_PIXEL_ID: string = "954415130645592";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: Fbq;
};

type FbqWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

let enabled = false;

// Unlike Google's tag there's no global off switch, so this flag gates every call.
export function setMetaPixelEnabled(on: boolean) {
  enabled = on && META_PIXEL_ID !== "";
}

// Meta's standard queue: calls made before fbevents.js has downloaded wait in
// fbq.queue and are sent in order.
export function initFbq() {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  const w = window as FbqWindow;
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  w.fbq = fbq;
  w._fbq = fbq;
  // No automatic button-click / page-metadata events: only what we send below.
  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
}

function fbq(...args: unknown[]) {
  if (!enabled || typeof window === "undefined") return;
  initFbq();
  (window as FbqWindow).fbq!(...args);
}

export function metaPageView() {
  fbq("track", "PageView");
}

export function metaInitiateCheckout(value: number, riders: number) {
  fbq("track", "InitiateCheckout", { currency: "USD", value, num_items: riders });
}

// eventID = confirmation number, so a later server-side (Conversions API)
// copy of the same purchase is de-duplicated instead of counted twice.
export function metaPurchase(confirmationNumber: string, value: number, riders: number) {
  fbq("track", "Purchase", { currency: "USD", value, num_items: riders }, { eventID: confirmationNumber });
}
