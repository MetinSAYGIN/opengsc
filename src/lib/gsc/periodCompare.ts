// "This period vs the previous one" for queries or pages — the dashboard's tables, Winners &
// Losers, New Rankings and position buckets — computed from two per-key aggregates.
//
// Both aggregates must be COMPLETE: every key Search Console reports for that period, not a
// top-N. The dashboard used to compare two top-250 lists, so a query that merely fell outside
// the previous top 250 read as "new" or as "0 → N clicks", and the table's "of 250" was the cut,
// not the site. Callers feed this either the stored per-day history (QueryDaily) or a live fetch
// at Google's 25k-row maximum, and say which.
//
// Pure: no Prisma, no Google — unit-tested in periodCompare.test.ts.

export interface KeyAgg {
  clicks: number;
  impressions: number;
  /** Σ position × impressions. Divided by impressions it gives Google's own period position. */
  posWeighted: number;
}
export type AggMap = Map<string, KeyAgg>;

/** Rows sent for the queries/pages tables (the rest is counted in `total`). */
export const TABLE_ROWS = 1000;
export const MOVERS_ROWS = 20;
export const NEW_ROWS = 100;

/**
 * % change, or null when there is nothing to divide by. Growth from zero is not "+100%" — it
 * is unbounded, and the UI says "new" instead of a number that reads like a doubling.
 */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

export function avgPosition(a: Pick<KeyAgg, "impressions" | "posWeighted">): number {
  return a.impressions > 0 ? a.posWeighted / a.impressions : 0;
}

export interface TableRow {
  label: string; clicks: number; impr: number; ctr: number; pos: number;
  cPct: number | null; iPct: number | null;
}
export interface Mover { label: string; curr: number; prev: number; delta: number }
export interface PositionBuckets { "1-3": number; "4-10": number; "11-20": number; "21+": number }

export interface PeriodComparison {
  rows: TableRow[];           // top TABLE_ROWS by clicks, then impressions
  total: number;              // keys with any data this period
  winners: Mover[];
  losers: Mover[];
  newRows: TableRow[];        // impressions now, none at all in the previous period
  buckets: PositionBuckets;   // every key with impressions, by its period position
  visibleClicks: number;      // clicks attributed to a key (queries: excludes anonymized ones)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function toRow(label: string, c: KeyAgg, p: KeyAgg | undefined): TableRow {
  return {
    label,
    clicks: c.clicks,
    impr: c.impressions,
    ctr: c.impressions > 0 ? round1((c.clicks / c.impressions) * 100) : 0,
    pos: round1(avgPosition(c)),
    cPct: pctChange(c.clicks, p?.clicks ?? 0),
    iPct: pctChange(c.impressions, p?.impressions ?? 0),
  };
}

// Deterministic order: Google's own order for equal clicks is unspecified, which is how the
// old top-250 cut picked an arbitrary slice of the zero-click queries.
const byTraffic = (a: [string, KeyAgg], b: [string, KeyAgg]) =>
  b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

export function comparePeriods(curr: AggMap, prev: AggMap): PeriodComparison {
  const sorted = [...curr].sort(byTraffic);

  const movers: Mover[] = [];
  for (const k of new Set([...curr.keys(), ...prev.keys()])) {
    if (!k) continue;
    const c = curr.get(k)?.clicks ?? 0;
    const p = prev.get(k)?.clicks ?? 0;
    if (c !== p) movers.push({ label: k, curr: c, prev: p, delta: c - p });
  }
  const tie = (a: Mover, b: Mover) => b.curr - a.curr || (a.label < b.label ? -1 : 1);
  const winners = movers.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta || tie(a, b)).slice(0, MOVERS_ROWS);
  const losers = movers.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta || tie(a, b)).slice(0, MOVERS_ROWS);

  const newRows = sorted
    .filter(([k, c]) => c.impressions > 0 && !(prev.get(k)?.impressions))
    .slice(0, NEW_ROWS)
    .map(([k, c]) => toRow(k, c, undefined));

  const buckets: PositionBuckets = { "1-3": 0, "4-10": 0, "11-20": 0, "21+": 0 };
  let visibleClicks = 0;
  for (const [, c] of sorted) {
    visibleClicks += c.clicks;
    if (c.impressions <= 0) continue;
    const pos = avgPosition(c);
    if (pos <= 3) buckets["1-3"]++;
    else if (pos <= 10) buckets["4-10"]++;
    else if (pos <= 20) buckets["11-20"]++;
    else buckets["21+"]++;
  }

  return {
    rows: sorted.slice(0, TABLE_ROWS).map(([k, c]) => toRow(k, c, prev.get(k))),
    total: sorted.length,
    winners, losers, newRows, buckets, visibleClicks,
  };
}

/** Search Console rows (one dimension) → AggMap. Position from Google is already per period. */
export function aggFromGscRows(rows: { keys?: string[] | null; clicks?: number | null; impressions?: number | null; position?: number | null }[]): AggMap {
  const m: AggMap = new Map();
  for (const r of rows) {
    const k = r.keys?.[0];
    if (!k) continue;
    const impressions = r.impressions ?? 0;
    m.set(k, { clicks: r.clicks ?? 0, impressions, posWeighted: (r.position ?? 0) * impressions });
  }
  return m;
}
