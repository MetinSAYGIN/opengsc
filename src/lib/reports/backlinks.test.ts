import assert from "node:assert/strict";
import test from "node:test";
import { dayInWindow, summarizeBacklinks, type StoredBacklink } from "./backlinks";
import { providerDrLabel, providerFromSyncMode, providerLabel } from "../seo/backlinkProvider";
import { renderReportHTML } from "./render";
import type { ReportData } from "./collect";

// A 7-day report generated 2026-10-11 20:00 UTC: calendar days 10-05 … 10-11.
const to = new Date("2026-10-11T20:00:00Z");
const from = new Date(to.getTime() - 7 * 86_400_000); // 2026-10-04T20:00Z

const row = (o: Partial<StoredBacklink> & { id: string }): StoredBacklink => ({
  urlFrom: `https://${o.id}.example/p`, domainFrom: `${o.id}.example`, apiDr: null, apiAnchor: "a",
  apiFirstSeen: "2025-01-01", apiLastSeen: "2026-10-10", apiLost: false, ...o,
});

test("window is exactly `days` calendar days — the from-day is out, today is in", () => {
  assert.equal(dayInWindow("2026-10-04", from, to), false);
  assert.equal(dayInWindow("2026-10-05", from, to), true);
  assert.equal(dayInWindow("2026-10-11", from, to), true);
  assert.equal(dayInWindow("2026-10-12", from, to), false);
  assert.equal(dayInWindow("", from, to), false);
  assert.equal(dayInWindow("garbage", from, to), false);
});

test("lost counts only losses inside the window, not every row ever flagged lost (#29)", () => {
  const rows = [
    row({ id: "old1", apiLost: true, apiLastSeen: "2026-03-01" }),          // lost months ago
    row({ id: "old2", apiLost: true, apiLastSeen: "2026-09-01" }),          // lost last month
    row({ id: "ev", apiLost: true, apiLastSeen: "2026-09-20" }),            // our sync saw the flip this week
    row({ id: "ls", apiLost: true, apiLastSeen: "2026-10-08" }),            // arrived already lost, last seen this week
    row({ id: "back", apiLost: false }),                                    // lost event this week, but returned since
  ];
  const d = summarizeBacklinks({ rows, lostEventIds: ["ev", "back"], from, to, provider: "dataforseo", drLabel: null });
  assert.equal(d.lostCount, 2);
});

test("new counts first-seen inside the window only", () => {
  const rows = [
    row({ id: "edge", apiFirstSeen: "2026-10-04" }), // the 8th day the old filter let in
    row({ id: "n1", apiFirstSeen: "2026-10-05" }),
    row({ id: "n2", apiFirstSeen: "2026-10-11" }),
    row({ id: "old", apiFirstSeen: "2026-01-01" }),
  ];
  const d = summarizeBacklinks({ rows, lostEventIds: [], from, to, provider: "ahrefs", drLabel: "Ahrefs DR" });
  assert.equal(d.newCount, 2);
  assert.deepEqual(d.topNew.map(r => r.domainFrom).sort(), ["n1.example", "n2.example"]);
});

test("avg DR is over the period's new links, and absent for a provider without per-link DR", () => {
  const rows = [
    row({ id: "n1", apiFirstSeen: "2026-10-06", apiDr: 40 }),
    row({ id: "n2", apiFirstSeen: "2026-10-07", apiDr: 20 }),
    row({ id: "old", apiFirstSeen: "2020-01-01", apiDr: 90 }), // must not pull the average up
  ];
  const ah = summarizeBacklinks({ rows, lostEventIds: [], from, to, provider: "ahrefs", drLabel: "Ahrefs DR" });
  assert.equal(ah.avgDr, 30);
  const dfs = summarizeBacklinks({ rows, lostEventIds: [], from, to, provider: "dataforseo", drLabel: null });
  assert.equal(dfs.avgDr, null);
  assert.ok(dfs.topNew.every(r => r.dr === null));
});

test("provider is read from the sync's pagination mode", () => {
  assert.equal(providerFromSyncMode("dataforseo_token"), "dataforseo");
  assert.equal(providerFromSyncMode("keysso_page"), "keysso");
  assert.equal(providerFromSyncMode("offset"), "ahrefs");
  assert.equal(providerFromSyncMode("keyset"), "ahrefs");
  assert.equal(providerFromSyncMode(""), "ahrefs");
  assert.equal(providerLabel("dataforseo"), "DataForSEO");
  assert.equal(providerLabel(null), "API");
  assert.equal(providerDrLabel("dataforseo"), null);
  assert.equal(providerDrLabel("keysso"), "Keys.so DR");
});

function reportWith(b: NonNullable<ReportData["backlinks"]>): string {
  const data = {
    siteDomain: "client.example",
    window: { from: "2026-10-04", to: "2026-10-11", days: 7, prevFrom: "2026-09-27", prevTo: "2026-10-04" },
    backlinks: b,
  } as unknown as ReportData;
  return renderReportHTML({ title: "T", sections: ["backlinks"], data, generatedAt: "2026-10-11T20:00:00Z" });
}

test("report names the provider and drops the DR KPI for DataForSEO", () => {
  const html = reportWith({ provider: "dataforseo", newCount: 4, lostCount: 1, avgDr: null, drLabel: null, topNew: [] });
  assert.match(html, /Source: DataForSEO/);
  assert.doesNotMatch(html, /Avg .*DR/);
  assert.doesNotMatch(html, /Ahrefs/);
});

test("report keeps the DR KPI, labelled, for Ahrefs", () => {
  const html = reportWith({ provider: "ahrefs", newCount: 2, lostCount: 0, avgDr: 30, drLabel: "Ahrefs DR",
    topNew: [{ urlFrom: "https://n1.example/p", domainFrom: "n1.example", dr: 40, anchor: "a" }] });
  assert.match(html, /Source: Ahrefs/);
  assert.match(html, /Avg Ahrefs DR of new donors/);
  assert.match(html, /30\.0/);
});
