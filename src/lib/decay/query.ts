// Content Decay — the database half. One function, used by /api/gsc/decay and the MCP
// get_content_decay tool, so the dashboard and an agent can never disagree about which pages
// are decaying. The rules themselves live in ./logic (pure, tested).

import { prisma } from "@/lib/prisma";
import {
  classifyDecay, compareDecay, decayWindows, isoDay, pagePath, parseSiteTags,
  type DayRange, type DecayMetric, type DecayPeriod, type DecayStatus, type DecayWindows,
} from "./logic";

export interface DecaySite {
  id: string;
  url: string;
  tags?: string | null;
}

export interface DecayRow {
  siteId: string;
  siteName: string;
  url: string;
  page: string;
  current: number;
  previous: number;
  change: number;
  changePct: number;
  yoyPct: number | null;
  status: DecayStatus;
}

export interface DecayWindowInfo {
  current: { start: string; end: string };
  previous: { start: string; end: string };
  days: number;
  /** False when no site has page data reaching back a full year — the YoY column is then empty by necessity. */
  yoyAvailable: boolean;
}

/** One line of the portfolio site picker — every site with page data, flagged or not. */
export interface DecaySiteSummary {
  siteId: string;
  siteName: string;
  tags: string[];
  /** Pages with traffic in either window. */
  examined: number;
  lost: number;
  critical: number;
  warning: number;
  /** Sum of `change` over this site's flagged pages (≤ 0). */
  change: number;
}

export interface DecayResult {
  rows: DecayRow[];
  /** Flagged pages (after the site filter) before `limit` was applied. */
  total: number;
  truncated: boolean;
  /** Distinct pages that had any traffic in either window, across the filtered sites. */
  examined: number;
  /** The windows of the most recently synced (filtered) site. */
  windows: DecayWindowInfo | null;
  /** Sites were synced on different days, so their windows differ. */
  mixedWindows: boolean;
  /** Every site, unfiltered — the picker needs counts for the sites that aren't selected too. */
  sites: DecaySiteSummary[];
}

export interface DecayOptions {
  metric: DecayMetric;
  period: DecayPeriod;
  minPrevious: number;
  /** Cap on returned rows (sorted worst-first). */
  limit: number;
  /** Only these sites' rows are returned; the per-site summary still covers every site. */
  onlySites?: ReadonlySet<string> | null;
}

export function siteDisplayName(siteUrl: string): string {
  return siteUrl.replace("sc-domain:", "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Page-level rows only: url='' is the site-level rollup, query<>'' are query+page summaries.
const pageRows = { url: { not: "" }, query: "" } as const;

/** Per-site, per-URL sums of `metric` over one window, for a group of sites sharing it. */
async function sumsBySiteUrl(siteIds: string[], range: DayRange, metric: DecayMetric): Promise<Map<string, number>> {
  const where = { siteId: { in: siteIds }, ...pageRows, date: { gte: range.start, lte: range.end } };
  // Spelled out per metric: a computed `_sum` key makes Prisma's groupBy overload fall back to `any`.
  const out = new Map<string, number>();
  if (metric === "impressions") {
    const g = await prisma.dailyMetric.groupBy({ by: ["siteId", "url"], where, _sum: { impressions: true } });
    for (const r of g) out.set(`${r.siteId}\n${r.url}`, r._sum.impressions ?? 0);
  } else {
    const g = await prisma.dailyMetric.groupBy({ by: ["siteId", "url"], where, _sum: { clicks: true } });
    for (const r of g) out.set(`${r.siteId}\n${r.url}`, r._sum.clicks ?? 0);
  }
  return out;
}

/** SQLite's bound-parameter ceiling is 32766; stay far below it and keep each scan modest. */
const SITE_CHUNK = 400;

function windowInfo(w: DecayWindows, yoyAvailable: boolean): DecayWindowInfo {
  return {
    current: { start: isoDay(w.current.start), end: isoDay(w.current.end) },
    previous: { start: isoDay(w.previous.start), end: isoDay(w.previous.end) },
    days: w.days,
    yoyAvailable,
  };
}

export async function findDecayingPages(sites: DecaySite[], opts: DecayOptions): Promise<DecayResult> {
  const empty: DecayResult = { rows: [], total: 0, truncated: false, examined: 0, windows: null, mixedWindows: false, sites: [] };
  if (!sites.length) return empty;
  const siteById = new Map(sites.map(s => [s.id, s]));

  // Each site's newest and oldest page-level day. Anchoring per site means a portfolio with one
  // stale site doesn't drag every other site's window back with it.
  const spans = [];
  for (let i = 0; i < sites.length; i += SITE_CHUNK) {
    spans.push(...await prisma.dailyMetric.groupBy({
      by: ["siteId"],
      where: { siteId: { in: sites.slice(i, i + SITE_CHUNK).map(s => s.id) }, ...pageRows },
      _max: { date: true },
      _min: { date: true },
    }));
  }

  // Sites synced on the same day share every window, so they share every query: a portfolio of a
  // thousand sites costs a few grouped scans per distinct sync day, not four per site.
  const groups = new Map<string, { w: DecayWindows; yoySites: Set<string>; siteIds: string[] }>();
  for (const span of spans) {
    const w = decayWindows(span._max.date ?? null, opts.period);
    if (!w || !span._min.date) continue;
    const key = isoDay(w.current.end);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { w, yoySites: new Set(), siteIds: [] });
    g.siteIds.push(span.siteId);
    if (span._min.date.getTime() <= w.yearAgo.start.getTime()) g.yoySites.add(span.siteId);
  }

  const rows: DecayRow[] = [];
  const summary = new Map<string, DecaySiteSummary>();
  const only = opts.onlySites && opts.onlySites.size ? opts.onlySites : null;
  let examined = 0;
  let newest: DecayWindows | null = null;
  let anyYoy = false;
  const anchors = new Set<string>();

  for (const [key, g] of groups) {
    for (let i = 0; i < g.siteIds.length; i += SITE_CHUNK) {
      const ids = g.siteIds.slice(i, i + SITE_CHUNK);
      const yoyIds = ids.filter(id => g.yoySites.has(id));
      const tailIsCurrent = g.w.tail.start.getTime() === g.w.current.start.getTime();
      // Sequential: SQLite serialises them anyway, and four concurrent scans of a big table only
      // contend for the same lock.
      const cur = await sumsBySiteUrl(ids, g.w.current, opts.metric);
      const prev = await sumsBySiteUrl(ids, g.w.previous, opts.metric);
      const yago = yoyIds.length ? await sumsBySiteUrl(yoyIds, g.w.yearAgo, opts.metric) : null;
      const tail = tailIsCurrent ? null : await sumsBySiteUrl(ids, g.w.tail, opts.metric);

      const examinedBySite = new Map<string, number>();
      for (const k of new Set([...cur.keys(), ...prev.keys()])) {
        const siteId = k.slice(0, k.indexOf("\n"));
        examinedBySite.set(siteId, (examinedBySite.get(siteId) ?? 0) + 1);
      }
      for (const id of ids) {
        const site = siteById.get(id)!;
        summary.set(id, {
          siteId: id, siteName: siteDisplayName(site.url), tags: parseSiteTags(site.tags),
          examined: examinedBySite.get(id) ?? 0, lost: 0, critical: 0, warning: 0, change: 0,
        });
      }

      for (const [k, previous] of prev) {
        const nl = k.indexOf("\n");
        const siteId = k.slice(0, nl), url = k.slice(nl + 1);
        const v = classifyDecay(
          {
            current: cur.get(k) ?? 0,
            previous,
            yearAgo: yago && g.yoySites.has(siteId) ? (yago.get(k) ?? 0) : null,
            ...(tail ? { tail: tail.get(k) ?? 0 } : {}),
          },
          opts.minPrevious,
        );
        if (!v) continue;
        const sum = summary.get(siteId)!;
        sum.change += v.change;
        if (v.status === "Lost") sum.lost++; else if (v.status === "Critical") sum.critical++; else sum.warning++;
        if (!only || only.has(siteId)) rows.push({ siteId, siteName: sum.siteName, url, page: pagePath(url), ...v });
      }
    }

    // Windows, YoY and "examined" describe what is shown, i.e. the filtered sites.
    const shown = only ? g.siteIds.filter(id => only.has(id)) : g.siteIds;
    if (!shown.length) continue;
    anchors.add(key);
    if (shown.some(id => g.yoySites.has(id))) anyYoy = true;
    for (const id of shown) examined += summary.get(id)?.examined ?? 0;
    if (!newest || g.w.current.end > newest.current.end) newest = g.w;
  }

  rows.sort(compareDecay);
  const limit = Math.max(1, opts.limit);
  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    truncated: rows.length > limit,
    examined,
    windows: newest ? windowInfo(newest, anyYoy) : null,
    mixedWindows: anchors.size > 1,
    sites: [...summary.values()].sort((a, b) => a.change - b.change || a.siteName.localeCompare(b.siteName)),
  };
}
