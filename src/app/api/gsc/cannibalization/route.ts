import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildRelatedIntentGroups, siteBrandTerms } from '@/lib/cannibalization/relatedIntent';
import { findCannibalization } from '@/lib/cannibalization/query';
import { brandTermsOf } from '@/lib/cannibalization/exact';
import {
  intParam, newestWindow, parseSiteSelection, queryPageWindows, reportParams,
  resolveReportSites, resolveReportUserId, siteDisplayName,
} from '@/lib/gsc/reportScope';

/** Related-intent rows read per site (it was 30 000 for the whole portfolio). */
const RELATED_ROWS_PER_SITE = 30_000;

// GET|POST /api/gsc/cannibalization  { siteId, mode=exact|related, minImpressions=30, limit, sites? }
//
// exact   — every site's own competing-URL groups (src/lib/cannibalization/exact.ts), plus a
//           per-site summary for the portfolio picker. POST carries the picker's selection.
// related — deterministic related-intent conflicts (relatedIntent.ts), now read per site.
// `days` is accepted and ignored: the rows are one 90-day total per pair; `window` says which.
async function handle(req: Request) {
  const p = await reportParams(req);
  if (!p) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  const siteId = String(p.siteId ?? '');
  const userId = await resolveReportUserId(req, siteId);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sites = await resolveReportSites(userId, siteId);
  if (!sites) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const minImpr = intParam(p.minImpressions, 30, 1, 1_000_000);
  const only = parseSiteSelection(p.sites);
  const brand = sites.length === 1 ? brandTermsOf(sites[0].siteId) : [];

  if (p.mode === 'related') {
    const limit = intParam(p.limit, 60, 1, 500);
    const shown = only ? sites.filter(s => only.has(s.id)) : sites;
    let truncated = false;
    const groups = [];
    // One site at a time: each site gets its own row budget, and its rows are dropped as soon as
    // its groups are built. One portfolio-wide `take` let the biggest sites starve the rest.
    for (const site of shown) {
      const rows = await prisma.dailyMetric.findMany({
        where: { siteId: site.id, query: { not: '' }, url: { not: '' } },
        select: { siteId: true, query: true, url: true, date: true, clicks: true, impressions: true, ctr: true, position: true },
        orderBy: { impressions: 'desc' },
        take: RELATED_ROWS_PER_SITE,
      });
      if (rows.length === RELATED_ROWS_PER_SITE) truncated = true;
      groups.push(...buildRelatedIntentGroups(rows, {
        siteId: site.id, siteName: siteDisplayName(site.url), brandTerms: siteBrandTerms(site.siteId), minImpressions: minImpr, limit,
      }));
    }
    groups.sort((l, r) => r.confidence - l.confidence || r.totalImpressions - l.totalImpressions);
    const windows = await queryPageWindows(shown.map(s => s.id));
    const { window, mixed } = newestWindow(windows, shown.map(s => s.id));
    return NextResponse.json({
      mode: 'related',
      groups: groups.slice(0, limit),
      total: groups.length,
      brand,
      methodology: { deterministic: true, paidCalls: 0, candidateIndex: ['query_tokens', 'ranking_urls'], autoActions: false },
      truncated,
      window,
      mixedWindows: mixed,
    });
  }

  const res = await findCannibalization(
    sites.map(s => ({ id: s.id, url: s.url, siteId: s.siteId, tags: s.tags })),
    { minImpressions: minImpr, limit: intParam(p.limit, 5000, 1, 20000), onlySites: only },
  );
  return NextResponse.json({
    groups: res.groups,
    total: res.total,
    truncated: res.truncated,
    brand,
    window: res.window,
    mixedWindows: res.mixedWindows,
    sites: res.sites,
  });
}

export const GET = handle;
export const POST = handle;
