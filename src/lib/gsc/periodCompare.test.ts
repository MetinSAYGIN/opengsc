import assert from "node:assert/strict";
import test from "node:test";
import { comparePeriods, pctChange, aggFromGscRows, avgPosition, type AggMap } from "./periodCompare";

const agg = (o: Record<string, [number, number, number?]>): AggMap =>
  new Map(Object.entries(o).map(([k, [clicks, impressions, pos = 5]]) => [k, { clicks, impressions, posWeighted: pos * impressions }]));

test("growth from zero is not +100%", () => {
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(0, 0), 0);
  assert.equal(pctChange(8, 4), 100);
  assert.equal(pctChange(3, 4), -25);
});

test("movers come from the union, so a query that dropped to zero is a loser", () => {
  const r = comparePeriods(agg({ a: [8, 20], b: [0, 3] }), agg({ a: [3, 10], c: [1, 2] }));
  assert.deepEqual(r.winners.map(w => [w.label, w.prev, w.curr]), [["a", 3, 8]]);
  assert.deepEqual(r.losers.map(w => [w.label, w.prev, w.curr]), [["c", 1, 0]]);
});

test("new = impressions now and none in the previous period, wherever it ranked", () => {
  const r = comparePeriods(agg({ old: [0, 4], fresh: [0, 1], back: [1, 1] }), agg({ old: [0, 9], back: [0, 0] }));
  assert.deepEqual(r.newRows.map(x => x.label).sort(), ["back", "fresh"]);
  assert.ok(r.newRows.every(x => x.cPct === null || x.cPct === 0));
});

test("position is impression-weighted, like Search Console", () => {
  // 90 impressions at 2, 10 at 40 → 5.8, not the (2+40)/2 = 21 a plain mean gives
  const m: AggMap = new Map([["q", { clicks: 0, impressions: 100, posWeighted: 90 * 2 + 10 * 40 }]]);
  assert.equal(Math.round(avgPosition(m.get("q")!) * 10) / 10, 5.8);
  const r = comparePeriods(m, new Map());
  assert.equal(r.rows[0].pos, 5.8);
  assert.equal(r.buckets["4-10"], 1);
});

test("table is cut at TABLE_ROWS but total counts every key; order is deterministic", () => {
  const big: AggMap = new Map();
  for (let i = 0; i < 1500; i++) big.set(`q${String(i).padStart(4, "0")}`, { clicks: 0, impressions: 1, posWeighted: 30 });
  const r = comparePeriods(big, new Map());
  assert.equal(r.rows.length, 1000);
  assert.equal(r.total, 1500);
  assert.equal(r.rows[0].label, "q0000");
});

test("visibleClicks sums keyed clicks; GSC rows map position × impressions", () => {
  const m = aggFromGscRows([{ keys: ["a"], clicks: 2, impressions: 4, position: 3 }, { keys: [], clicks: 9 }]);
  assert.deepEqual(m.get("a"), { clicks: 2, impressions: 4, posWeighted: 12 });
  assert.equal(m.size, 1);
  assert.equal(comparePeriods(m, new Map()).visibleClicks, 2);
});
