// Content Decay — the pure half. No Prisma, no fetch: everything here runs under `tsx --test`.
//
// What used to be wrong (#28), and why the windows below look the way they do:
//
//  • "Last 2 months" was the last two CALENDAR buckets, the current one included. On Oct 11 that
//    compared 11 days of October + September against all of July + August, so nearly every page
//    on every site read as decaying. A verdict needs two windows of equal length, both complete.
//  • The windows are anchored to the last day that actually has page data, not to today. A site
//    synced a week ago would otherwise get a week of zeros in its "current" window.
//  • The last FRESH_DAYS of that data are left out: the sync asks Search Console for
//    dataState:'all', and its newest days are provisional and still filling in.
//  • Only the top 20 pages were ever examined. After a migration the URLs worth finding are
//    exactly the small ones that went to zero — so every page is examined now, with a volume
//    floor instead of a top-N cut to keep 2→1-click noise out.
//  • Window lengths are whole weeks (56 / 14 days) so both sides hold the same weekday mix, and
//    the year-ago window is shifted by 364 days (52 weeks) for the same reason.

export type DecayPeriod = "month" | "week";
export type DecayMetric = "clicks" | "impressions";
export type DecayStatus = "Lost" | "Critical" | "Warning";

export const DAY_MS = 86_400_000;

/** Search Console's newest days are provisional under dataState:'all'. */
export const FRESH_DAYS = 2;

/** Per side of the comparison. "month" keeps the old "last 2 months" meaning, in whole weeks. */
export const WINDOW_DAYS: Record<DecayPeriod, number> = { month: 56, week: 14 };

/**
 * "Lost" looks at the tail of the current window, not all of it: a URL that died three weeks
 * into an 8-week window still has five weeks of traffic in it and would read as merely
 * "Critical" for another month — exactly the migrated-away URL #28 is trying to find.
 */
export const LOST_TAIL_DAYS = 14;

/** Change at or below these percentages flags a page. Unchanged from the original thresholds. */
export const WARNING_PCT = -5;
export const CRITICAL_PCT = -25;

/** Default volume floor: the previous window must have had at least this much of the metric. */
export const DEFAULT_MIN_PREVIOUS: Record<DecayMetric, number> = { clicks: 5, impressions: 100 };

export interface DayRange {
  /** Inclusive, UTC midnight. */
  start: Date;
  /** Inclusive, UTC midnight. */
  end: Date;
}

export interface DecayWindows {
  current: DayRange;
  previous: DayRange;
  /** The current window one year (52 weeks) earlier. */
  yearAgo: DayRange;
  /** The last LOST_TAIL_DAYS of the current window (all of it when the window is shorter). */
  tail: DayRange;
  days: number;
}

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The three windows for a site whose newest page-level row is `lastDataDay`.
 * Returns null when there is no data to anchor on.
 */
export function decayWindows(lastDataDay: Date | null | undefined, period: DecayPeriod): DecayWindows | null {
  if (!lastDataDay || Number.isNaN(lastDataDay.getTime())) return null;
  const days = WINDOW_DAYS[period];
  const end = addDays(utcDay(lastDataDay), -FRESH_DAYS);
  const current: DayRange = { start: addDays(end, -(days - 1)), end };
  const previous: DayRange = { start: addDays(current.start, -days), end: addDays(current.start, -1) };
  const yearAgo: DayRange = { start: addDays(current.start, -364), end: addDays(current.end, -364) };
  const tail: DayRange = { start: addDays(end, -(Math.min(days, LOST_TAIL_DAYS) - 1)), end };
  return { current, previous, yearAgo, tail, days };
}

export interface DecayInput {
  current: number;
  previous: number;
  /** Same window a year earlier; null when the site has no page data reaching back that far. */
  yearAgo: number | null;
  /** The tail of the current window (see LOST_TAIL_DAYS). Omitted = same as `current`. */
  tail?: number;
}

export interface DecayVerdict {
  current: number;
  previous: number;
  change: number;
  changePct: number;
  yoyPct: number | null;
  status: DecayStatus;
}

/**
 * Is this page decaying, and how badly? null = not flagged.
 *
 *  - previous below the floor → null (too small to tell a trend from noise)
 *  - nothing in the tail of the current window → Lost: it had traffic and now has none. After a
 *    migration these are the old URLs; in normal life it is a deindexed or broken page. Either
 *    way the first thing to look at.
 *  - change ≤ CRITICAL_PCT → Critical, ≤ WARNING_PCT → Warning
 */
export function classifyDecay(input: DecayInput, minPrevious: number): DecayVerdict | null {
  const { current, previous } = input;
  const floor = Math.max(1, minPrevious);
  if (previous < floor) return null;
  const changePct = Math.round(((current - previous) / previous) * 100);
  let status: DecayStatus;
  if ((input.tail ?? current) === 0 && current < previous) status = "Lost";
  else if (changePct <= CRITICAL_PCT) status = "Critical";
  else if (changePct <= WARNING_PCT) status = "Warning";
  else return null;
  const yoyPct = input.yearAgo != null && input.yearAgo > 0
    ? Math.round(((current - input.yearAgo) / input.yearAgo) * 100)
    : null;
  return { current, previous, change: current - previous, changePct, yoyPct, status };
}

/**
 * Biggest absolute loss first, then the steeper percentage. Absolute, not percent: a page that
 * went 2000 → 1200 matters more than one that went 10 → 4, and a Lost page sorts by what it had.
 */
export function compareDecay(a: { status: DecayStatus; change: number; changePct: number }, b: { status: DecayStatus; change: number; changePct: number }): number {
  return a.change - b.change || a.changePct - b.changePct;
}

/** The path part of a page URL, for display. */
export function pagePath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, "") || "/";
}

// ─── HTTP status check ──────────────────────────────────────────────────────────

export type HttpVerdict = "ok" | "redirect" | "client_error" | "server_error" | "error";

export interface HttpHop {
  url: string;
  status: number;
}

export interface HttpCheckResult {
  url: string;
  /** Status of the first response (what a crawler hitting the old URL gets). 0 = no response. */
  status: number;
  /** Every response in order, first one included. */
  chain: HttpHop[];
  /** Where the redirects end (or the hop that failed), when there were any. */
  finalUrl: string | null;
  /** Status at the end of the chain. */
  finalStatus: number | null;
  verdict: HttpVerdict;
  /** Set when there was no usable answer: timeout, DNS, loop, private address… */
  error?: string;
}

export function httpVerdict(status: number, finalStatus: number | null): HttpVerdict {
  if (status <= 0) return "error";
  if (status >= 300 && status < 400 && status !== 304) {
    // A redirect that lands on an error is the error, not "a redirect" — that's the case a
    // migration audit exists to catch.
    if (finalStatus != null && finalStatus >= 400) return finalStatus >= 500 ? "server_error" : "client_error";
    if (finalStatus == null || finalStatus <= 0) return "error";
    return "redirect";
  }
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "ok";
}

/** Did the chain redirect more than once? A 301 → 301 → 200 chain is worth flattening. */
export function redirectHops(r: Pick<HttpCheckResult, "chain">): number {
  return r.chain.filter(h => h.status >= 300 && h.status < 400 && h.status !== 304).length;
}

// ─── CSV ────────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 with two practical additions: a leading = + - @ (or tab/CR) on a TEXT cell is
 * defused with an apostrophe so a spreadsheet never evaluates it as a formula, and a BOM so
 * Excel reads UTF-8 (non-Latin paths) instead of guessing a code page.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) || s !== String(v) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// ─── Sites ──────────────────────────────────────────────────────────────────────

/** Site.tags is either a JSON array or a comma-separated string, depending on when it was written. */
export function parseSiteTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return [...new Set(arr.map(x => String(x).trim()).filter(Boolean))];
  } catch { /* fall through to CSV */ }
  return [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))];
}
