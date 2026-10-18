// Reading the stored per-day query history (QueryDaily) for a period comparison.
import { prisma } from "@/lib/prisma";
import { utcDay, type DayRange } from "@/lib/periodWindow";
import type { AggMap } from "@/lib/gsc/periodCompare";

const storedDay = (d: Date) => d.toISOString().slice(0, 10); // rows are UTC midnights

async function aggregate(siteId: string, r: DayRange): Promise<AggMap> {
  const g = await prisma.queryDaily.groupBy({
    by: ["query"],
    where: { siteId, date: { gte: utcDay(r.startStr), lte: utcDay(r.endStr) } },
    _sum: { clicks: true, impressions: true, posWeighted: true },
  });
  return new Map(g.map(x => [x.query, {
    clicks: x._sum.clicks ?? 0,
    impressions: x._sum.impressions ?? 0,
    posWeighted: x._sum.posWeighted ?? 0,
  }]));
}

/**
 * Both periods' per-query aggregates from history — or null when the stored days do not cover
 * both periods end to end (history still backfilling, or today's sync not run yet). Null means
 * "fetch live"; a partly covered period is never answered from history, because a missing day
 * would read as a drop. Also null when the table does not exist yet (`prisma db push` pending).
 */
export async function queryHistoryFor(siteId: string, curr: DayRange, prev: DayRange): Promise<{ curr: AggMap; prev: AggMap } | null> {
  try {
    const [site, newest] = await Promise.all([
      prisma.site.findUnique({ where: { id: siteId }, select: { queryHistoryFrom: true } }),
      prisma.queryDaily.findFirst({ where: { siteId }, orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    if (!site?.queryHistoryFrom || !newest) return null;
    const lo = prev.startStr < curr.startStr ? prev.startStr : curr.startStr;
    const hi = curr.endStr > prev.endStr ? curr.endStr : prev.endStr;
    if (storedDay(site.queryHistoryFrom) > lo || storedDay(newest.date) < hi) return null;
    const [c, p] = await Promise.all([aggregate(siteId, curr), aggregate(siteId, prev)]);
    return { curr: c, prev: p };
  } catch {
    return null;
  }
}
