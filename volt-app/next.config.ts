import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
