"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { GA_ID, initGtag, isTrackedPath, setTrackingEnabled, trackPageView } from "@/lib/analytics";

// Loads the Google tag once for the whole site and sends a page view on every
// route change. On staff pages the tag is switched off with Google's own
// "ga-disable" flag (set during render, before the URL changes), so not even
// automatic scroll/click events are recorded there.
export default function GoogleTag() {
  const pathname = usePathname();
  // Local testing never reaches Google, so test bookings don't skew reports.
  const local = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const tracked = isTrackedPath(pathname) && !local;
  setTrackingEnabled(tracked);
  initGtag();

  useEffect(() => {
    if (tracked) trackPageView(pathname, window.location.search);
  }, [pathname, tracked]);

  return (
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
  );
}
