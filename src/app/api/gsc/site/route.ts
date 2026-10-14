import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { resolveWindow, windowDays, utcDay, shiftYmd } from '@/lib/periodWindow';
import { comparePeriods, aggFromGscRows, pctChange } from '@/lib/gsc/periodCompare';
import { queryHistoryFor } from '@/lib/gsc/queryHistory';

function pct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

type GscAccount = { id: string; access_token: string | null; refresh_token: string | null; expires_at: number | null };

// Build an authenticated OAuth2 client for an account
function makeOAuth2(account: GscAccount) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  oauth2.on('tokens', async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        refresh_token: tokens.refresh_token ?? account.refresh_token,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
      },
    });
  });
  return oauth2;
}

// Try each linked account until one successfully queries GSC for the given siteUrl
async function queryGSC(
  accounts: GscAccount[],
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimension: string,
  rowLimit = 250
) {
  for (const account of accounts) {
    try {
      const oauth2 = makeOAuth2(account);
      const wm = google.webmasters({ version: 'v3', auth: oauth2 });
      const res = await wm.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: [dimension],
          rowLimit,
          dataState: 'all',
        },
      });
      return res.data.rows ?? [];
    } catch {
      continue;
    }
  }
  return [];
}

import { verifyAuthOrShare } from '@/lib/authShare';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain') || '';
  const period = searchParams.get('period') || '7d';

  const auth = await verifyAuthOrShare(req, domain, true);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId, site } = auth;

  // ── Date windows ──────────────────────────────────────────────────────────────
  // One resolver for the whole app: the period key, or the custom range the dashboard
  // carries as ?start=&end= when it was left on a manually-picked window.
  // GSC 'final' data lags ~2 days
  const window = resolveWindow(period, searchParams.get('start'), searchParams.get('end'));
  const { days } = window;

  // Both periods as calendar days: the previous one has the same length and ends the day
  // before the current one starts. These used to come from toISOString() on local-midnight
  // instants, which on a server east of UTC read every start as the day before — "7 days"
  // asked Google for 8, and the two periods shared a day (a query clicked only on that day
  // counted on both sides, so a real 1 → 0 loss showed as no change). See windowDays().
  const { curr: currDays, prev: prevDays } = windowDays(window);
  const { startStr, endStr } = currDays;
  const { startStr: prevStartStr, endStr: prevEndStr } = prevDays;

  // Get user's Google accounts
  const accounts = await prisma.account.findMany({
    where: { userId, provider: 'google' },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });

  // ── Chart data from DB ────────────────────────────────────────────────────────
  const [currRows, prevRows] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: { siteId: site.id, date: { gte: utcDay(startStr), lte: utcDay(endStr) }, url: '', query: '', searchType: 'web' },
      orderBy: { date: 'asc' },
    }),
    // The previous period ONLY. summary.change compares its totals with the current ones; this
    // used to run on to the current period's end, so 7 days were compared with 14 and every
    // KPI % on the dashboard was skewed toward a drop.
    prisma.dailyMetric.findMany({
      where: { siteId: site.id, date: { gte: utcDay(prevStartStr), lte: utcDay(prevEndStr) }, url: '', query: '', searchType: 'web' },
    }),
  ]);

  const prevMap = new Map<string, typeof prevRows[0]>();
  for (const r of prevRows) prevMap.set(r.date.toISOString().split('T')[0], r);

  const chartData = currRows.map((r) => {
    const comp = prevMap.get(shiftYmd(r.date.toISOString().split('T')[0], -days));
    return {
      // DailyMetric dates are UTC midnights — label them in UTC, or west of UTC every day
      // reads as the one before.
      date:         new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      dateIso:      new Date(r.date).toISOString().split('T')[0],
      clicks:       r.clicks,
      impressions:  r.impressions,
      ctr:          +((r.ctr * 100).toFixed(2)),
      position:     +r.position.toFixed(1),
      clicksC:      comp?.clicks ?? 0,
      impressionsC: comp?.impressions ?? 0,
      ctrC:         comp ? +((comp.ctr * 100).toFixed(2)) : 0,
      positionC:    comp ? +comp.position.toFixed(1) : 0,
    };
  });

  // Summary totals. CTR and position are what Search Console shows for the period: total
  // clicks / total impressions, and position weighted by impressions. (They used to be plain
  // averages of the daily values, so a quiet day counted as much as a busy one.)
  const sumRows = (rows: typeof currRows) =>
    rows.reduce(
      (a, m) => ({ clicks: a.clicks + m.clicks, impressions: a.impressions + m.impressions, posW: a.posW + m.position * m.impressions }),
      { clicks: 0, impressions: 0, posW: 0 }
    );

  const c = sumRows(currRows);
  const p = sumRows(prevRows);
  const avgCtr = (s: typeof c) => s.impressions > 0 ? +((s.clicks / s.impressions) * 100).toFixed(2) : 0;
  const avgPos = (s: typeof c) => s.impressions > 0 ? +(s.posW / s.impressions).toFixed(1) : 0;

  const summary = {
    clicks:      { value: c.clicks,       change: pct(c.clicks, p.clicks) },
    impressions: { value: c.impressions,   change: pct(c.impressions, p.impressions) },
    ctr:         { value: avgCtr(c),       change: pct(avgCtr(c), avgCtr(p)) },
    position:    { value: avgPos(c),       change: pct(avgPos(c), avgPos(p)) },
  };

  // ── Queries & pages: COMPLETE per-key sets for both periods ─────────────────
  // The tables, Winners & Losers, New Rankings and the position buckets all compare the two
  // periods, and that only means something over complete sets (lib/gsc/periodCompare.ts):
  // the old top-250 lists turned "fell out of the previous top 250" into "new" and "0 → N".
  // Queries come from the stored per-day history when it covers both periods, else live at
  // Google's 25k-row maximum; pages are live (few, and Google's positions are exact).
  const FULL = 25000;
  const history = await queryHistoryFor(site.id, currDays, prevDays);
  const [
    qCurrRows, qPrevRows, pageRows, prevPageRows,
    countryRows, deviceRows, prevCountryRows, prevDeviceRows,
  ] = await Promise.all([
    history ? Promise.resolve([]) : queryGSC(accounts, site.siteId, startStr, endStr, 'query', FULL),
    history ? Promise.resolve([]) : queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'query', FULL),
    queryGSC(accounts, site.siteId, startStr, endStr, 'page', FULL),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'page', FULL),
    queryGSC(accounts, site.siteId, startStr, endStr, 'country', 100),
    queryGSC(accounts, site.siteId, startStr, endStr, 'device', 10),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'country', 100),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'device', 10),
  ]);

  const qCmp = comparePeriods(history?.curr ?? aggFromGscRows(qCurrRows), history?.prev ?? aggFromGscRows(qPrevRows));
  const pCmp = comparePeriods(aggFromGscRows(pageRows), aggFromGscRows(prevPageRows));

  const queries    = qCmp.rows;
  const pages      = pCmp.rows;
  const newQueries = qCmp.newRows;
  const newPages   = pCmp.newRows;

  const prevCountryMap = new Map(prevCountryRows.map(r => [r.keys?.[0], r]));
  const prevDeviceMap  = new Map(prevDeviceRows.map(r => [r.keys?.[0], r]));

  // ── Countries with real change % ──────────────────────────────────────────────
  const countries = countryRows.map(r => {
    const key  = r.keys?.[0] ?? '';
    const prev = prevCountryMap.get(key);
    return {
      name:   key,
      flag:   '',
      clicks: r.clicks ?? 0,
      impr:   r.impressions ?? 0,
      ctr:    +((( r.ctr ?? 0) * 100).toFixed(1)),
      pos:    +(( r.position ?? 0).toFixed(1)),
      cPct:   pctChange(r.clicks ?? 0, prev?.clicks ?? 0),
      iPct:   pctChange(r.impressions ?? 0, prev?.impressions ?? 0),
    };
  });

  // ── Devices with real change % ────────────────────────────────────────────────
  const devices = deviceRows.map(r => {
    const key      = r.keys?.[0] ?? '';
    const prev     = prevDeviceMap.get(key);
    const currCtr  = (r.ctr ?? 0) * 100;
    const prevCtr  = (prev?.ctr ?? 0) * 100;
    const currPos  = r.position ?? 0;
    const prevPos  = prev?.position ?? 0;
    return {
      name:     key,
      clicks:   r.clicks ?? 0,
      impr:     r.impressions ?? 0,
      ctr:      +currCtr.toFixed(1),
      pos:      +currPos.toFixed(1),
      cPct:     pctChange(r.clicks ?? 0, prev?.clicks ?? 0),
      iPct:     pctChange(r.impressions ?? 0, prev?.impressions ?? 0),
      ctrPct:   prev ? +(currCtr - prevCtr).toFixed(1) : 0,
      posDelta: prev ? +(currPos - prevPos).toFixed(1) : 0,
    };
  });

  // ── Winners & Losers: click delta between the two periods, over complete sets ─
  // `coverage` lets the panel say how much of the site's traffic it can see at all: Search
  // Console withholds anonymized queries, so on a small site the keyed queries may carry a
  // third of the clicks. Saying so beats a list that silently looks like the whole picture.
  const winnersLosers = {
    queries: { winners: qCmp.winners, losers: qCmp.losers },
    pages:   { winners: pCmp.winners, losers: pCmp.losers },
    coverage: {
      totalClicks: c.clicks,
      queries: {
        visibleClicks: qCmp.visibleClicks,
        source:   history ? 'history' as const : 'live' as const,
        complete: history ? true : qCurrRows.length < FULL && qPrevRows.length < FULL,
      },
      pages: {
        visibleClicks: pCmp.visibleClicks,
        source:   'live' as const,
        complete: pageRows.length < FULL && prevPageRows.length < FULL,
      },
    },
  };

  // ── Position buckets: every query with impressions, at its period position ────
  const positionBuckets = qCmp.buckets;

  return NextResponse.json({
    siteDbId: site.id,
    chartData,
    summary,
    queries,
    pages,
    countries,
    devices,
    newQueries,
    newPages,
    positionBuckets,
    winnersLosers,
    // How many queries/pages the period has in all — the tables carry the top TABLE_ROWS.
    totals: { queries: qCmp.total, pages: pCmp.total },
    hasData: currRows.length > 0,
  });
}
