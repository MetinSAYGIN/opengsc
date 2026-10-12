import type { MetadataRoute } from "next";

// Deliberately no `Disallow` — including the tempting `Disallow: /`. A robots-blocked
// page is never fetched, so Google never sees the noindex meta/header (layout.tsx +
// X-Robots-Tag in next.config.ts), and an already-indexed URL then sits in the index
// indefinitely as "Indexed, though blocked by robots.txt". Allowing the crawl is what
// lets the noindex be read and the pages actually dropped.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
