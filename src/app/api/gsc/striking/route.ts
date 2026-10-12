import { NextResponse } from 'next/server';
import { findStriking } from '@/lib/striking/query';
import {
  intParam, parseSiteSelection, reportParams, resolveReportSites, resolveReportUserId,
} from '@/lib/gsc/reportScope';

// GET|POST /api/gsc/striking  { siteId, posFrom=4, posTo=20, minImpressions=10, limit=10000, sites? }
//
// Every query+page pair in the position band, from every site (see src/lib/striking/query.ts),
// plus a per-site summary for the portfolio picker. POST carries the picker's selection, which can
// be hundreds of ids. `days` is still accepted and ignored: the rows are one 90-day total per
// pair, and the response says which 90 days (`window`).
async function handle(req: Request) {
  const p = await reportParams(req);
  if (!p) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  const siteId = String(p.siteId ?? '');
  const userId = await resolveReportUserId(req, siteId);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sites = await resolveReportSites(userId, siteId);
  if (!sites) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const posFrom = intParam(p.posFrom, 4, 1, 100);
  const posTo = Math.max(posFrom, intParam(p.posTo, 20, 1, 100));
  const res = await findStriking(
    sites.map(s => ({ id: s.id, url: s.url, tags: s.tags })),
    {
      posFrom,
      // The band is inclusive of the whole last position: 20 means "up to 20.9", not "≤ 20.0".
      posTo: posTo + 0.99,
      minImpressions: intParam(p.minImpressions, 10, 1, 1_000_000),
      limit: intParam(p.limit, 10000, 1, 20000),
      onlySites: parseSiteSelection(p.sites),
    },
  );

  return NextResponse.json({
    keywords: res.rows,
    total: res.total,
    truncated: res.truncated,
    window: res.window,
    mixedWindows: res.mixedWindows,
    sites: res.sites,
  });
}

export const GET = handle;
export const POST = handle;
