import { NextResponse } from 'next/server';
import { findRelatedIntent } from '@/lib/cannibalization/related';
import { findCannibalization } from '@/lib/cannibalization/query';
import { brandTermsOf } from '@/lib/cannibalization/exact';
import {
  intParam, parseSiteSelection, reportParams, resolveReportSites, resolveReportUserId,
} from '@/lib/gsc/reportScope';

// GET|POST /api/gsc/cannibalization  { siteId, mode=exact|related, minImpressions=30, limit, sites? }
//
// exact   — every site's own competing-URL groups (src/lib/cannibalization/exact.ts), plus a
//           per-site summary for the portfolio picker. POST carries the picker's selection.
// related — deterministic related-intent conflicts (src/lib/cannibalization/related.ts): per
//           site, with per-day rows for "winner changes", plus the same per-site summary.
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
    const res = await findRelatedIntent(
      sites.map(s => ({ id: s.id, url: s.url, siteId: s.siteId, tags: s.tags })),
      { minImpressions: minImpr, limit: intParam(p.limit, 200, 1, 500), onlySites: only },
    );
    return NextResponse.json({
      mode: 'related',
      groups: res.groups,
      total: res.total,
      brand,
      methodology: { deterministic: true, paidCalls: 0, candidateIndex: ['query_tokens', 'ranking_urls'], autoActions: false },
      truncated: res.truncated,
      window: res.window,
      mixedWindows: res.mixedWindows,
      dailyWindow: res.dailyWindow,
      sites: res.sites,
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
