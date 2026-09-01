import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/emp-login", "/api/"],
      },
    ],
    sitemap: "https://volttransportation.com/sitemap.xml",
  };
}
