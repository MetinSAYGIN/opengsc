import { test } from "node:test";
import assert from "node:assert/strict";
import { benchmarkCtr, estimatedGain, proximity } from "./logic";

test("benchmark CTR: table on page one, ~1% past it, rounding the position", () => {
  assert.equal(benchmarkCtr(1), 0.276);
  assert.equal(benchmarkCtr(3.4), 0.110);
  assert.equal(benchmarkCtr(0.2), 0.276, "clamped to 1");
  assert.equal(benchmarkCtr(18), 0.01);
});

test("estimated gain: clicks at #3 with today's impressions, minus today's clicks, never negative", () => {
  assert.equal(estimatedGain(1000, 10), 100);
  assert.equal(estimatedGain(1000, 200), 0);
  assert.equal(estimatedGain(0, 0), 0);
});

test("proximity buckets", () => {
  assert.equal(proximity(4.2), "top5");
  assert.equal(proximity(5), "top5");
  assert.equal(proximity(9.9), "page1");
  assert.equal(proximity(14), "nearPage2");
  assert.equal(proximity(19.5), "page2plus");
});
