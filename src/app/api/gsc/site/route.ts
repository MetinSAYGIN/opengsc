import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { resolveWindow, windowDays, utcDay, shiftYmd } from '@/lib/periodWindow';

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

  // Summary totals
  const sumRows = (rows: typeof currRows) =>
    rows.reduce(
      (a, m) => ({ clicks: a.clicks + m.clicks, impressions: a.impressions + m.impressions, ctr: a.ctr + m.ctr, pos: a.pos + m.position, n: a.n + 1 }),
      { clicks: 0, impressions: 0, ctr: 0, pos: 0, n: 0 }
    );

  const c = sumRows(currRows);
  const p = sumRows(prevRows);
  const avgCtr = (s: typeof c) => s.n > 0 ? +((s.ctr / s.n) * 100).toFixed(2) : 0;
  const avgPos = (s: typeof c) => s.n > 0 ? +(s.pos / s.n).toFixed(1) : 0;

  const summary = {
    clicks:      { value: c.clicks,       change: pct(c.clicks, p.clicks) },
    impressions: { value: c.impressions,   change: pct(c.impressions, p.impressions) },
    ctr:         { value: avgCtr(c),       change: pct(avgCtr(c), avgCtr(p)) },
    position:    { value: avgPos(c),       change: pct(avgPos(c), avgPos(p)) },
  };

  // ── Live GSC: all dimensions (current + previous period) ─────────────────────
  const [
    queryRows, pageRows, countryRows, deviceRows,
    prevQueryRows, prevPageRows, prevCountryRows, prevDeviceRows,
  ] = await Promise.all([
    queryGSC(accounts, site.siteId, startStr, endStr, 'query', 250),
    queryGSC(accounts, site.siteId, startStr, endStr, 'page', 250),
    queryGSC(accounts, site.siteId, startStr, endStr, 'country', 100),
    queryGSC(accounts, site.siteId, startStr, endStr, 'device', 10),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'query', 250),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'page', 250),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'country', 100),
    queryGSC(accounts, site.siteId, prevStartStr, prevEndStr, 'device', 10),
  ]);

  const prevQueryMap   = new Map(prevQueryRows.map(r => [r.keys?.[0], r]));
  const prevPageMap    = new Map(prevPageRows.map(r => [r.keys?.[0], r]));
  const prevCountryMap = new Map(prevCountryRows.map(r => [r.keys?.[0], r]));
  const prevDeviceMap  = new Map(prevDeviceRows.map(r => [r.keys?.[0], r]));

  type GscRow = typeof queryRows[0];
  const mapRows = (rows: GscRow[], pm: Map<string | undefined, GscRow>) =>
    rows.map(r => {
      const key  = r.keys?.[0] ?? '';
      const prev = pm.get(key);
      return {
        label:  key,
        clicks: r.clicks ?? 0,
        impr:   r.impressions ?? 0,
        ctr:    +((( r.ctr ?? 0) * 100).toFixed(1)),
        pos:    +(( r.position ?? 0).toFixed(1)),
        cPct:   pct(r.clicks ?? 0, prev?.clicks ?? 0),
        iPct:   pct(r.impressions ?? 0, prev?.impressions ?? 0),
      };
    });

  const queries = mapRows(queryRows, prevQueryMap);
  const pages   = mapRows(pageRows,  prevPageMap);

  // ── New Rankings: in current period but NOT in prev period ────────────────────
  const newQueries = queryRows
    .filter(r => !prevQueryMap.has(r.keys?.[0]))
    .map(r => ({
      label:  r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impr:   r.impressions ?? 0,
      ctr:    +((( r.ctr ?? 0) * 100).toFixed(1)),
      pos:    +(( r.position ?? 0).toFixed(1)),
      cPct:   100,  // new = +∞ (was 0, now exists)
      iPct:   100,
    }))
    .slice(0, 25);

  const newPages = pageRows
    .filter(r => !prevPageMap.has(r.keys?.[0]))
    .map(r => ({
      label:  r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impr:   r.impressions ?? 0,
      ctr:    +((( r.ctr ?? 0) * 100).toFixed(1)),
      pos:    +(( r.position ?? 0).toFixed(1)),
      cPct:   100,
      iPct:   100,
    }))
    .slice(0, 25);

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
      cPct:   pct(r.clicks ?? 0, prev?.clicks ?? 0),
      iPct:   pct(r.impressions ?? 0, prev?.impressions ?? 0),
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
      cPct:     pct(r.clicks ?? 0, prev?.clicks ?? 0),
      iPct:     pct(r.impressions ?? 0, prev?.impressions ?? 0),
      ctrPct:   prev ? +(currCtr - prevCtr).toFixed(1) : 0,
      posDelta: prev ? +(currPos - prevPos).toFixed(1) : 0,
    };
  });

  // ── Winners & Losers: click delta between the two periods ────────────────────
  // Union of current + previous rows, so queries that dropped to zero still show up.
  const computeWinnersLosers = (curr: GscRow[], pm: Map<string | undefined, GscRow>) => {
    const currMap = new Map(curr.map(r => [r.keys?.[0], r]));
    const keys = new Set([...currMap.keys(), ...pm.keys()]);
    const deltas: { label: string; curr: number; prev: number; delta: number }[] = [];
    for (const k of keys) {
      if (!k) continue;
      const c = currMap.get(k)?.clicks ?? 0;
      const p = pm.get(k)?.clicks ?? 0;
      if (c === p) continue;
      deltas.push({ label: k, curr: c, prev: p, delta: c - p });
    }
    const winners = deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 20);
    const losers  = deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 20);
    return { winners, losers };
  };

  const winnersLosers = {
    queries: computeWinnersLosers(queryRows, prevQueryMap),
    pages:   computeWinnersLosers(pageRows,  prevPageMap),
  };

  // ── Position buckets (from all fetched queries) ───────────────────────────────
  const positionBuckets = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const r of queryRows) {
    const pos = r.position ?? 0;
    if      (pos <= 3)  positionBuckets['1-3']++;
    else if (pos <= 10) positionBuckets['4-10']++;
    else if (pos <= 20) positionBuckets['11-20']++;
    else                positionBuckets['21+']++;
  }

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
    hasData: currRows.length > 0,
  });
}
