// Exact-query cannibalization: one query, two or more of the site's own URLs splitting it.
//
// The grouping rules are the ones the route always used (≥2 URLs, each ≥10% of the query's
// impressions, top two within 20 positions, branded queries skipped, "true" when the pages' own
// top queries overlap). What changed is what they run on:
//  • only query+page rows (the old groupBy let rollup and per-day page rows into its 10 000-row
//    `take` before filtering them out);
//  • per site, all of the site's rows — the old shared `take` let big sites crowd small ones
//    out of a portfolio report;
//  • groups keyed by site + query, so the same query on two sites is two groups.

export interface QueryPageRow {
  query: string; url: string;
  clicks: number; impressions: number; ctr: number; position: number;
}

export interface CannibalPage {
  url: string; fullUrl: string; topQuery: string;
  impressions: number; clicks: number; ctr: number; position: number;
  /** Share of the query's impressions across the competing pages, 0–100. */
  share: number;
}

export interface CannibalGroup {
  siteId: string; siteName: string;
  query: string;
  pages: CannibalPage[];
  isTrue: boolean;
  impressions: number;
  clicks: number;
}

export const MIN_SHARE = 0.10;
export const MAX_POSITION_GAP = 20;

/**
 * Brand words from the property: the first label of the host ("skgclean" for skgclean.gr).
 * Labels shorter than 3 characters are not used — "a.gr" would otherwise drop every query with
 * an "a" in it.
 */
export function brandTermsOf(property: string): string[] {
  const label = property
    .replace(/^https?:\/\//, "")
    .replace(/^sc-domain:/, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0]
    .split(".")[0]
    .toLowerCase();
  return label.length >= 3 ? [label] : [];
}

export function buildExactGroups(
  rows: QueryPageRow[],
  ctx: { siteId: string; siteName: string; brand: string[]; minImpressions: number },
): CannibalGroup[] {
  // Each URL's own strongest query — the "is this page really about something else?" signal.
  const urlBest = new Map<string, { query: string; impr: number }>();
  const byQuery = new Map<string, QueryPageRow[]>();
  for (const r of rows) {
    if (!r.query || !r.url) continue;
    const cur = urlBest.get(r.url);
    if (!cur || r.impressions > cur.impr) urlBest.set(r.url, { query: r.query, impr: r.impressions });
    const list = byQuery.get(r.query);
    if (list) list.push(r); else byQuery.set(r.query, [r]);
  }

  const out: CannibalGroup[] = [];
  for (const [query, entries] of byQuery) {
    if (entries.length < 2) continue;
    const ql = query.toLowerCase();
    if (ctx.brand.some(b => ql.includes(b))) continue;

    // One row per URL is the norm (90-day totals); fold defensively if a URL repeats.
    const perUrl = new Map<string, QueryPageRow>();
    for (const e of entries) {
      const p = perUrl.get(e.url);
      if (!p) { perUrl.set(e.url, { ...e }); continue; }
      const impr = p.impressions + e.impressions;
      p.position = impr ? (p.position * p.impressions + e.position * e.impressions) / impr : p.position;
      p.clicks += e.clicks; p.impressions = impr; p.ctr = impr ? p.clicks / impr : 0;
    }
    if (perUrl.size < 2) continue;
    const pagesAll = [...perUrl.values()].sort((a, b) => b.impressions - a.impressions);
    const totalImpr = pagesAll.reduce((s, p) => s + p.impressions, 0);
    if (totalImpr < ctx.minImpressions || totalImpr === 0) continue;

    const significant = pagesAll.filter(p => p.impressions / totalImpr >= MIN_SHARE);
    if (significant.length < 2) continue;
    if (Math.abs(significant[1].position - significant[0].position) > MAX_POSITION_GAP) continue;

    const sigImpr = significant.reduce((s, p) => s + p.impressions, 0);
    const pages: CannibalPage[] = significant.map(p => ({
      url: p.url.replace(/^https?:\/\/[^/]+/i, "") || "/",
      fullUrl: p.url,
      topQuery: urlBest.get(p.url)?.query ?? query,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: Math.round(p.ctr * 1000) / 10,
      position: Math.round(p.position * 10) / 10,
      share: Math.round((p.impressions / sigImpr) * 100),
    }));

    const queryWords = ql.split(/\s+/).filter(w => w.length > 3);
    const topQueries = pages.map(p => p.topQuery.toLowerCase());
    const sameTopQuery = new Set(topQueries).size < topQueries.length;
    const overlapping = queryWords.length > 0 && topQueries.filter(tq => queryWords.some(w => tq.includes(w))).length >= 2;

    out.push({
      siteId: ctx.siteId, siteName: ctx.siteName, query, pages,
      isTrue: sameTopQuery || overlapping,
      impressions: sigImpr,
      clicks: pages.reduce((s, p) => s + p.clicks, 0),
    });
  }
  return out;
}
