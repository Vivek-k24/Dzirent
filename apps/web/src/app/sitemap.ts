// apps/web/src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://dzirent.com";
  const now = new Date();

  const publicRoutes = [
    "",
    "/about",
    "/help",
    "/privacy",
    "/terms",
    "/community-guidelines",
    "/copyright",
    "/safety",
    "/delete-account",
    "/support",
    "/accessibility",
    "/studios",
  ];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route.startsWith("/about") ? 0.8 : 0.6,
  }));
}
