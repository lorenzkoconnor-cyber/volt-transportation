import type { MetadataRoute } from "next";

const BASE_URL = "https://volttransportation.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { url: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { url: "/about", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/how-it-works", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/pricing", priority: 0.9, changeFrequency: "monthly" as const },
    { url: "/locations", priority: 0.8, changeFrequency: "monthly" as const },
    { url: "/contact", priority: 0.7, changeFrequency: "monthly" as const },
    { url: "/safety-rules", priority: 0.6, changeFrequency: "monthly" as const },
    { url: "/terms", priority: 0.4, changeFrequency: "yearly" as const },
    { url: "/privacy-policy", priority: 0.4, changeFrequency: "yearly" as const },
    { url: "/manage-reservation", priority: 0.7, changeFrequency: "monthly" as const },
  ];

  return routes.map((route) => ({
    url: `${BASE_URL}${route.url}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
