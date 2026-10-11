import { NextResponse } from 'next/server';
import { workspaceUserId } from "@/lib/team/workspace";
import { prisma } from '@/lib/prisma';
import { findDecayingPages } from '@/lib/decay/query';
import { DEFAULT_MIN_PREVIOUS } from '@/lib/decay/logic';

type Metric = 'clicks' | 'impressions';

// Build time buckets for the requested period
function buildBuckets(type: 'month' | 'week', count: number) {
  const now = new Date();
  const buckets: { label: string; start: Date; end: Date; year?: number }[] = [];

  if (type === 'month') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      buckets.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        year:  d.getFullYear(),
        start, end,
      });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const day = ref.getDay();
      const mon = new Date(ref); mon.setDate(ref.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0,0,0,0);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59);
      buckets.push({
        label: ref.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: mon, end: sun,
      });
    }
  }
  return buckets;
}

// Assign a DailyMetric record to a bucket index (-1 if none match)
function bucketIndex(date: Date, buckets: ReturnType<typeof buildBuckets>): number {
  const t = date.getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t <= buckets[i].end.getTime()) return i;
  }
  return -1;
}

// GET /api/gsc/decay?siteId=&metric=clicks|impressions&period=month|week&cols=16&top=20
//                   &parts=heatmap,decay&min=5&limit=5000
//
// Two answers share this route:
//  • heatmap — the top `top` pages by metric, bucketed by calendar month/week (a picture, so the
//    current partial bucket is fine there).
//  • decay   — every page whose traffic fell, compared over two equal complete windows. See
//    src/lib/decay/logic.ts for why that is no longer "the last two buckets of the heatmap".
// `parts` lets each caller ask for only its half; omitted, both are returned as before.
/** The workspace owner, or — via a share link — the owner of that one shared site (never 'all'). */
async function resolveUserId(req: Request, siteId: string): Promise<string | null> {
  const userId = await workspaceUserId();
  if (userId) return userId;
  const shareToken = new URL(req.url).searchParams.get('shareToken') ?? '';
  if (shareToken && siteId && siteId !== 'all') {
    const shared = await prisma.site.findFirst({ where: { id: siteId, shareToken, shareEnabled: true } });
    if (shared) return shared.userId;
  }
  return null;
}

/** The sites a request covers: one explicit site, or the live portfolio. null = not this user's. */
async function resolveSites(userId: string, siteId: string) {
  if (siteId === 'all' || !siteId) {
    // Archived and hidden sites stay out of portfolio-wide reports (see striking/route.ts);
    // an explicit siteId still reaches them on purpose.
    return prisma.site.findMany({ where: { userId, hidden: false, archivedAt: null } });
  }
  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  return site ? [site] : null;
}

const asMetric = (v: unknown): Metric => (v === 'impressions' ? 'impressions' : 'clicks');
const asPeriod = (v: unknown): 'month' | 'week' => (v === 'week' ? 'week' : 'month');
function asMin(v: unknown, metric: Metric): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 1_000_000) : DEFAULT_MIN_PREVIOUS[metric];
}
function asLimit(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '5000'), 10);
  return Math.min(Math.max(Number.isFinite(n) ? Math.floor(n) : 5000, 1), 20000);
}

function decayFieldsOf(res: Awaited<ReturnType<typeof findDecayingPages>>, minPrev: number) {
  return {
    decay: res.rows,
    decayTotal: res.total,
    decayTruncated: res.truncated,
    decayExamined: res.examined,
    decayWindows: res.windows,
    decayMixedWindows: res.mixedWindows,
    decayMin: minPrev,
    decaySites: res.sites,
  };
}

interface DecayParams {
  siteId: string;
  metric: Metric;
  period: 'month' | 'week';
  cols: number;
  top: number;
  wantHeat: boolean;
  wantDecay: boolean;
  min: number;
  limit: number;
  /** Portfolio picker selection; null = every site. */
  only: Set<string> | null;
}

function intIn(v: unknown, def: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Math.min(Math.max(Number.isFinite(n) ? Math.floor(n) : def, lo), hi);
}

function paramsOf(src: Record<string, unknown>): DecayParams {
  const metric = asMetric(src.metric);
  const parts = Array.isArray(src.parts) ? src.parts.map(String) : String(src.parts ?? 'heatmap,decay').split(',');
  const sitesRaw = Array.isArray(src.sites) ? src.sites : typeof src.sites === 'string' && src.sites ? src.sites.split(',') : null;
  const only = sitesRaw ? new Set(sitesRaw.map(String).filter(Boolean).slice(0, 20000)) : null;
  return {
    siteId: String(src.siteId ?? ''),
    metric,
    period: asPeriod(src.period),
    cols: intIn(src.cols, 16, 4, 24),
    top: intIn(src.top, 20, 1, 50),
    wantHeat: parts.includes('heatmap'),
    wantDecay: parts.includes('decay'),
    min: asMin(src.min, metric),
    limit: asLimit(src.limit),
    only: only && only.size ? only : null,
  };
}

// POST /api/gsc/decay  — same parameters as GET, in a JSON body. The portfolio site picker's
// selection (`sites`) can be hundreds of ids, far past what a URL carries.
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const p = paramsOf(body);
  const userId = await resolveUserId(req, p.siteId);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return respond(userId, p);
}

export async function GET(req: Request) {
  const p = paramsOf(Object.fromEntries(new URL(req.url).searchParams));
  const userId = await resolveUserId(req, p.siteId);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return respond(userId, p);
}

async function respond(userId: string, p: DecayParams) {
  const { metric, cols } = p;
  const periodType = p.period;
  const topN = p.top;

  const sites = await resolveSites(userId, p.siteId);
  if (!sites) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The decay summary needs every site (the picker shows counts for unselected ones too); the
  // heatmap only the selected.
  const shown = p.only ? sites.filter(s => p.only!.has(s.id)) : sites;
  const siteIds = shown.map(s => s.id);
  const siteMap = new Map(shown.map(s => [s.id, s]));

  const decayFields = p.wantDecay
    ? decayFieldsOf(await findDecayingPages(
        sites.map(s => ({ id: s.id, url: s.url, tags: s.tags })),
        { metric, period: periodType, minPrevious: p.min, limit: p.limit, onlySites: p.only },
      ), p.min)
    : {};
  if (!p.wantHeat) return NextResponse.json({ pages: [], cols: [], allVals: [], ...decayFields });
  if (!siteIds.length) return NextResponse.json({ pages: [], cols: [], allVals: [], ...decayFields });

  // ── Build time buckets ────────────────────────────────────────────────────────
  const buckets = buildBuckets(periodType, cols);
  const rangeStart = buckets[0].start;
  const rangeEnd   = buckets[buckets.length - 1].end;

  // ── Top N URLs by metric in range ─────────────────────────────────────────────
  // query='' ensures we only get URL-level rows (not query+URL rows)
  const topUrls = await prisma.dailyMetric.groupBy({
    by: ['siteId', 'url'],
    // url<>'' in the query, not after it: the site-level rollup rows (url='') exist once per
    // search type per site, so on a portfolio they could fill the whole `take` and leave the
    // heatmap with no pages at all.
    where: { siteId: { in: siteIds }, url: { not: '' }, query: '', date: { gte: rangeStart, lte: rangeEnd } },
    _sum: { clicks: true, impressions: true },
    orderBy: { _sum: { [metric]: 'desc' } },
    take: topN,
  });

  const urls = topUrls;
  if (urls.length === 0) return NextResponse.json({ pages: [], cols: buckets.map(b => b.label), allVals: [], ...decayFields });
  const topNUrls = urls.slice(0, topN);

  // ── Fetch daily records for those URLs ───────────────────────────────────────
  const records = await prisma.dailyMetric.findMany({
    where: {
      siteId: { in: siteIds },
      url: { in: topNUrls.map(u => u.url) },
      query: '',
      date: { gte: rangeStart, lte: rangeEnd }
    },
    select: { siteId: true, url: true, date: true, clicks: true, impressions: true },
  });

  // ── Bucket aggregation ────────────────────────────────────────────────────────
  const urlBuckets = new Map<string, number[]>();
  for (const u of topNUrls) {
    urlBuckets.set(`${u.siteId}::${u.url}`, new Array(cols).fill(0));
  }

  for (const r of records) {
    const key = `${r.siteId}::${r.url}`;
    const arr = urlBuckets.get(key);
    if (!arr) continue;
    const idx = bucketIndex(new Date(r.date), buckets);
    if (idx >= 0) arr[idx] += metric === 'clicks' ? r.clicks : r.impressions;
  }

  // ── Build page matrix ─────────────────────────────────────────────────────────
  const pages = topNUrls.map(u => {
    const key = `${u.siteId}::${u.url}`;
    const site = siteMap.get(u.siteId);
    const domain = site ? site.url.replace("sc-domain:", "").replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
    return {
      siteId: u.siteId,
      siteName: domain,
      url: u.url,
      path: u.url.replace(/^https?:\/\/[^/]+/, '') || '/',
      vals: urlBuckets.get(key)!,
    };
  });

  const allVals = new Array(cols).fill(0);
  for (const { vals } of pages) vals.forEach((v, i) => { allVals[i] += v; });

  return NextResponse.json({
    // `url` stays the path (the column is narrow and the domain repeats on every row); `fullUrl`
    // is what the UI links to and copies — a path alone can't be opened, and on the portfolio
    // view it doesn't even say which site it belongs to (#28).
    pages:   pages.map(p => ({ url: p.path, fullUrl: p.url, vals: p.vals, siteName: p.siteName })),
    cols:    buckets.map(b => b.label),
    years:   periodType === 'month' ? buckets.map(b => b.year) : undefined,
    allVals,
    ...decayFields,
  });
}
