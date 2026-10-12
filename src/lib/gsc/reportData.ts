// Data helpers shared by the GSC report computations (striking, cannibalization, decay). No auth
// and no request objects here, so the computations stay usable from MCP tools and scripts;
// the route-side rules (who may read which sites) live in ./reportScope.

import { prisma } from "@/lib/prisma";

export function siteDisplayName(siteUrl: string): string {
  return siteUrl.replace("sc-domain:", "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** SQLite's bound-parameter ceiling is 32766; stay well below it. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export interface SummaryWindow {
  /** Inclusive ISO days. */
  start: string;
  end: string;
  days: number;
}

/**
 * The query+page rows are one 90-day total per pair, stored on the sync's end day (gscSync
 * Step 4). There is no per-day data behind them, so the only honest "period" is that one —
 * this returns it per site, from the rows themselves.
 */
export async function queryPageWindows(siteIds: string[]): Promise<Map<string, SummaryWindow>> {
  const out = new Map<string, SummaryWindow>();
  for (const ids of chunk(siteIds, 400)) {
    const g = await prisma.dailyMetric.groupBy({
      by: ["siteId"],
      where: { siteId: { in: ids }, url: { not: "" }, query: { not: "" } },
      _max: { date: true },
    });
    for (const r of g) {
      const end = r._max.date;
      if (!end) continue;
      const start = new Date(end.getTime() - QUERY_PAGE_DAYS * 86_400_000);
      out.set(r.siteId, { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: QUERY_PAGE_DAYS });
    }
  }
  return out;
}

/**
 * Days of per-day query+page rows kept in QueryPageDaily (gscSync Step 5) — the window Related
 * intent counts "winner changes" over. Four weeks: long enough for a flip-flop pattern, short
 * enough that date × query × page stays within a few paged requests.
 */
export const QUERY_PAGE_DAILY_DAYS = 28;

/** Must match the window gscSync Step 4 asks Search Console for. */
export const QUERY_PAGE_DAYS = 90;

/** The newest window among the given sites, and whether they differ. */
export function newestWindow(windows: Map<string, SummaryWindow>, siteIds: Iterable<string>): { window: SummaryWindow | null; mixed: boolean } {
  let best: SummaryWindow | null = null;
  const ends = new Set<string>();
  for (const id of siteIds) {
    const w = windows.get(id);
    if (!w) continue;
    ends.add(w.end);
    if (!best || w.end > best.end) best = w;
  }
  return { window: best, mixed: ends.size > 1 };
}
