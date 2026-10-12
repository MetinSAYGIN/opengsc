import assert from "node:assert/strict";
import test from "node:test";
import { DAY_MS, gscRowsToTop, mergeTopRows, reportWindow, searchWindow, ymd } from "./window";

const NOW = new Date("2026-10-11T06:45:00Z");

test("search window ends two days back and covers exactly `days` dates (dashboard parity, #27)", () => {
  const s = searchWindow(7, NOW);
  assert.equal(s.endStr, "2026-10-09");
  assert.equal(s.startStr, "2026-10-03");
  assert.equal((s.to.getTime() - s.from.getTime()) / DAY_MS, 7);
  assert.equal(ymd(s.to), "2026-10-10"); // exclusive bound for DailyMetric (date < to)
});

test("previous search window sits immediately before the current one, same length", () => {
  const s = searchWindow(7, NOW);
  assert.equal(s.prevEndStr, "2026-10-02");
  assert.equal(s.prevStartStr, "2026-09-26");
  assert.equal(s.prevTo.getTime(), s.from.getTime());
  assert.equal((s.prevTo.getTime() - s.prevFrom.getTime()) / DAY_MS, 7);
});

test("search window is UTC-midnight aligned whatever the time of day", () => {
  for (const iso of ["2026-10-11T00:00:00Z", "2026-10-11T23:59:59Z"]) {
    const s = searchWindow(28, new Date(iso));
    assert.equal(s.endStr, "2026-10-09");
    assert.equal(s.from.getUTCHours(), 0);
    assert.equal(s.to.getUTCHours(), 0);
  }
});

test("a 1-day report reads exactly one Search Console date", () => {
  const s = searchWindow(1, NOW);
  assert.equal(s.startStr, s.endStr);
});

test("reportWindow keeps the calendar window for event sections and adds the search window", () => {
  const w = reportWindow(30, NOW);
  assert.equal(w.to.getTime(), NOW.getTime());
  assert.equal(w.from.getTime(), NOW.getTime() - 30 * DAY_MS);
  assert.equal(w.search.endStr, "2026-10-09");
  assert.equal(w.days, 30);
});

test("mergeTopRows: top N by clicks, impressions break ties, deltas against the previous period", () => {
  const cur = [
    { key: "b", clicks: 5, impressions: 10 },
    { key: "a", clicks: 7, impressions: 13 },
    { key: "c", clicks: 5, impressions: 40 },
    { key: "d", clicks: 1, impressions: 1 },
  ];
  const prev = [{ key: "a", clicks: 3, impressions: 9 }, { key: "c", clicks: 9, impressions: 50 }];
  const rows = mergeTopRows(cur, prev, 3);
  assert.deepEqual(rows.map(r => r.key), ["a", "c", "b"]);
  assert.deepEqual(rows.map(r => r.delta), [4, -4, null]); // "b" has no baseline row → null, not +5
});

test("mergeTopRows: no previous data at all → every delta is null, none claims to be new", () => {
  const rows = mergeTopRows([{ key: "a", clicks: 2, impressions: 3 }], null);
  assert.equal(rows[0].prevClicks, null);
  assert.equal(rows[0].delta, null);
});

test("gscRowsToTop drops keyless rows and coerces missing numbers to 0", () => {
  const top = gscRowsToTop([
    { keys: ["q"], clicks: 3, impressions: 9 },
    { keys: [], clicks: 1, impressions: 1 },
    { keys: ["r"], clicks: null, impressions: undefined },
  ]);
  assert.deepEqual(top, [
    { key: "q", clicks: 3, impressions: 9 },
    { key: "r", clicks: 0, impressions: 0 },
  ]);
});
