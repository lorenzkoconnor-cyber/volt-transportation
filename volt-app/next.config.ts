import type { NextConfig } from "next";

// Baseline browser protections on every page. No full script CSP: Next's inline
// bootstrap scripts + Stripe would need nonces, so only frame-ancestors is set
// (stops other sites embedding Volt in an iframe to trick clicks).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The root document `/` is the URL managed/edge caches (Hostinger
        // LiteSpeed, CDNs, the browser) hold on to most aggressively. After a
        // redeploy the hashed CSS/JS chunks get new names, so a stale cached
        // homepage HTML ends up referencing assets that no longer exist (404),
        // which is why the homepage loaded unstyled on first load/refresh while
        // every other route served fresh. Telling caches never to store the
        // homepage HTML guarantees it is always re-fetched with current asset
        // references. The hashed assets under /_next/static keep their own
        // long-lived immutable caching, so this only affects the tiny HTML doc.
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
