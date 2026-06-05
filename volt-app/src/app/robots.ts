import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/emp-login", "/dashboard/", "/api/"],
      },
    ],
    sitemap: "https://volttransportation.com/sitemap.xml",
  };
}
