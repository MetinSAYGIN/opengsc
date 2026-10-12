// The report's date math and row merging — pure, Prisma-free, so it is unit-tested directly.
//
// A report speaks two windows (issue #27):
//   • the calendar window — the `days` ending now. Event-like sections (uptime incidents, new
//     backlinks, reviews, indexing) read it: an incident from yesterday belongs in the report.
//   • the search window — the same length, but ending two days ago, exactly like the dashboard's
//     resolveWindow(): Search Console data lags ~2 days, and a report whose Clicks / Top queries
//     / Top pages disagree with the dashboard for "the same 7 days" is a report nobody trusts.
//
// Every Date here is a UTC midnight boundary with an EXCLUSIVE end (`date < to`), which is how
// DailyMetric rows are stored (new Date("YYYY-MM-DD")). The *Str fields are the inclusive
// calendar strings the Search Analytics API takes.

export const DAY_MS = 86_400_000;

/** How far Search Console data lags — the dashboard's window ends here too. */
export const GSC_LAG_DAYS = 2;

export interface SearchWindow {
  from: Date;       // first day, UTC midnight
  to: Date;         // day after the last day, UTC midnight (exclusive)
  prevFrom: Date;
  prevTo: Date;     // === from
  startStr: string; // "YYYY-MM-DD", inclusive
  endStr: string;
  prevStartStr: string;
  prevEndStr: string;
}

export interface ReportWindow {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
  search: SearchWindow;
}

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);

const utcMidnight = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function searchWindow(days: number, now = new Date()): SearchWindow {
  const n = Math.max(1, Math.round(days) || 1);
  const lastDay = new Date(utcMidnight(now).getTime() - GSC_LAG_DAYS * DAY_MS);
  const to = new Date(lastDay.getTime() + DAY_MS);
  const from = new Date(to.getTime() - n * DAY_MS);
  const prevTo = new Date(from);
  const prevFrom = new Date(prevTo.getTime() - n * DAY_MS);
  return {
    from, to, prevFrom, prevTo,
    startStr: ymd(from),
    endStr: ymd(lastDay),
    prevStartStr: ymd(prevFrom),
    prevEndStr: ymd(new Date(prevTo.getTime() - DAY_MS)),
  };
}

export function reportWindow(days: number, now = new Date()): ReportWindow {
  const to = new Date(now);
  const from = new Date(to.getTime() - days * DAY_MS);
  const prevTo = new Date(from);
  const prevFrom = new Date(prevTo.getTime() - days * DAY_MS);
  return { from, to, prevFrom, prevTo, days, search: searchWindow(days, now) };
}

// ─── top rows ─────────────────────────────────────────────────────────────────

export interface TopRow { key: string; clicks: number; impressions: number }

export interface MetricRow {
  key: string;
  clicks: number;
  impressions: number;
  prevClicks: number | null;
  delta: number | null; // clicks vs previous period; null = the key is new or has no baseline
}

/** Shape a Search Analytics response (one dimension) into TopRows. */
export function gscRowsToTop(rows: { keys?: (string | null)[] | null; clicks?: number | null; impressions?: number | null }[]): TopRow[] {
  const out: TopRow[] = [];
  for (const r of rows) {
    const key = r.keys?.[0];
    if (!key) continue;
    out.push({ key, clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0 });
  }
  return out;
}

/**
 * Top `limit` current rows by clicks (impressions break ties), each paired with its
 * previous-period clicks. `prev === null` means there is no baseline at all — every delta is
 * null then, rather than every row pretending to be brand new.
 */
export function mergeTopRows(cur: TopRow[], prev: TopRow[] | null, limit = 20): MetricRow[] {
  const prevMap = prev ? new Map(prev.map(r => [r.key, r.clicks])) : null;
  return [...cur]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit)
    .map(r => {
      const prevClicks = prevMap && prevMap.has(r.key) ? prevMap.get(r.key) ?? 0 : null;
      return {
        key: r.key,
        clicks: r.clicks,
        impressions: r.impressions,
        prevClicks,
        delta: prevClicks === null ? null : r.clicks - prevClicks,
      };
    });
}
