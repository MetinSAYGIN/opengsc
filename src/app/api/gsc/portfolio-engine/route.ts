import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { engineWindow, readCache, rebuildEnginePortfolio } from "@/lib/enginePortfolio";

// Live portfolio for Bing / Yandex: the stored snapshot, or — on ?refresh=1, the dashboard's Sync
// button — a rebuild from the engines' own APIs. The rebuild lives in src/lib/enginePortfolio.ts
// because the daily refresh after the scheduled Google sync (syncScheduler.ts) runs the same one.

export async function GET(req: Request) {
  const userId = await workspaceUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const engine = searchParams.get("engine") === "yandex" ? "yandex" : "bing";
  const period = searchParams.get("period") || "7d";
  const refresh = searchParams.get("refresh") === "1";
  const start = searchParams.get("start"), end = searchParams.get("end");

  const cacheKey = engineWindow(period, start, end).key;
  const snapshot = async () => {
    const cached = await readCache(userId, engine, cacheKey);
    return cached ? NextResponse.json({ sites: cached.sites, engine, cachedAt: cached.cachedAt, cached: true }) : null;
  };

  // Serve the stored snapshot instantly unless a rebuild was explicitly requested.
  if (!refresh) {
    const hit = await snapshot();
    if (hit) return hit;
  }

  const rebuilt = await rebuildEnginePortfolio(userId, engine, period, start, end);
  if (rebuilt.status === "noKey") return NextResponse.json({ sites: [], engine, noKey: true });
  // Nothing was written, so the last good snapshot is still the truth: show it rather than a
  // blank dashboard. With no snapshot yet, the same empty answer as before.
  if (rebuilt.status === "failed") return (await snapshot()) ?? NextResponse.json({ sites: [], engine, cachedAt: new Date().toISOString() });
  return NextResponse.json({ sites: rebuilt.sites, engine, cachedAt: rebuilt.cachedAt });
}
