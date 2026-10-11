// The client report's Backlinks section — pure, Prisma-free, unit-tested (issue #29).
//
// Three numbers, each scoped to the report window and each from ONE provider:
//
//   • New  — rows whose provider first-seen day falls in the window. The window is the last
//            `days` ending now, so in calendar days it is (fromDay, toDay] — exactly `days` days.
//            The old filter took [fromDay, toDay] and quietly reported one day more.
//   • Lost — rows the provider flags lost whose loss falls in the window: either a `lost` event
//            our sync recorded inside it, or (for rows that arrived already lost, which get no
//            transition event) the provider's last-seen day inside it. The old code counted
//            every row ever flagged lost, which is why a 7-day report said 8 and matched the
//            all-time "Lost per Ahrefs" counter on the Backlinks tab.
//   • Avg authority — over the NEW links only, and only when the provider stores a per-link
//            DR (Ahrefs, Keys.so). DataForSEO rows carry none, so the KPI is dropped rather than
//            shown as a permanent "—" or filled with a metric of a different scale.
//
// Placement checks (our own "link gone" verdicts) are a separate witness and are not mixed in.

import type { BacklinkProviderId } from "@/lib/seo/backlinkProvider";

export interface BacklinkRow { urlFrom: string; domainFrom: string; dr: number | null; anchor: string }

export interface BacklinksData {
  /** Who filled the rows; null when no api export has run (CSV/manual rows only). */
  provider: BacklinkProviderId | null;
  newCount: number;
  lostCount: number;
  /** Average provider DR of the period's new links; null = no DR-bearing new links. */
  avgDr: number | null;
  /** "Ahrefs DR" / "Keys.so DR"; null = the provider has no per-link DR, hide the KPI. */
  drLabel: string | null;
  topNew: BacklinkRow[];
}

export interface StoredBacklink {
  id: string;
  urlFrom: string;
  domainFrom: string | null;
  apiDr: number | null;
  apiAnchor: string | null;
  apiFirstSeen: string;
  apiLastSeen: string;
  apiLost: boolean;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** Is a provider "YYYY-MM-DD" inside (fromDay, toDay]? */
export function dayInWindow(day: string, from: Date, to: Date): boolean {
  if (!DAY_RE.test(day)) return false;
  return day > ymd(from) && day <= ymd(to);
}

export function summarizeBacklinks(input: {
  rows: StoredBacklink[];
  /** backlinkIds that got an api-origin `lost` event with createdAt in [from, to). */
  lostEventIds: Iterable<string>;
  from: Date;
  to: Date;
  provider: BacklinkProviderId | null;
  drLabel: string | null;
}): BacklinksData {
  const { rows, from, to, provider, drLabel } = input;
  const lostEvents = new Set(input.lostEventIds);

  const fresh = rows.filter(r => dayInWindow(r.apiFirstSeen, from, to));
  const lost = rows.filter(r => r.apiLost && (lostEvents.has(r.id) || dayInWindow(r.apiLastSeen, from, to)));

  const drs = drLabel
    ? fresh.map(r => r.apiDr).filter((d): d is number => typeof d === "number" && d > 0)
    : [];

  const topNew = [...fresh]
    .sort((a, b) => (b.apiDr ?? 0) - (a.apiDr ?? 0))
    .slice(0, 10)
    .map(r => ({ urlFrom: r.urlFrom, domainFrom: r.domainFrom ?? "", dr: drLabel ? r.apiDr ?? null : null, anchor: r.apiAnchor ?? "" }));

  return {
    provider,
    newCount: fresh.length,
    lostCount: lost.length,
    avgDr: drs.length ? Math.round(drs.reduce((s, d) => s + d, 0) / drs.length * 10) / 10 : null,
    drLabel,
    topNew,
  };
}
