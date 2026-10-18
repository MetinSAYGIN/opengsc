"use client";

// Moved: the old SEO Tools settings (model choice, per-task providers, fact-check) now live in
// Settings → AI models; SERP keys and pickers in Settings → SERP & scraping. This route only
// redirects old links/bookmarks.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SeoToolsSettingsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?tab=ai"); }, [router]);
  return null;
}
