import assert from "node:assert/strict";
import test from "node:test";
import { planQueryHistory, HISTORY_DAYS, CHUNKS_PER_SYNC, CHUNK_DAYS } from "./queryHistoryPlan";
import { shiftYmd } from "../periodWindow";

const end = "2026-10-12";

test("first sync: a week of tail, then backfill walks back from it without gaps", () => {
  const p = planQueryHistory({ endStr: end, newestStr: null, historyFromStr: null });
  assert.deepEqual(p.tail, { start: "2026-10-06", end });
  assert.equal(p.backfill.length, CHUNKS_PER_SYNC);
  assert.equal(p.backfill[0].end, "2026-10-05");
  for (let i = 1; i < p.backfill.length; i++) assert.equal(shiftYmd(p.backfill[i].end, 1), p.backfill[i - 1].start);
  assert.ok(p.backfill.every(r => shiftYmd(r.start, CHUNK_DAYS - 1) === r.end));
});

test("steady state: daily sync rewrites the tail, backfill continues from the cursor", () => {
  const p = planQueryHistory({ endStr: end, newestStr: "2026-10-11", historyFromStr: "2026-06-01" });
  assert.equal(p.tail.start, "2026-10-05"); // newest - 6 reaches one day further back than end - 6
  assert.equal(p.backfill[0].end, "2026-05-31");
});

test("missed syncs: the tail reaches back to the newest stored day, closing the gap", () => {
  const p = planQueryHistory({ endStr: end, newestStr: "2026-09-01", historyFromStr: "2026-01-01" });
  assert.equal(p.tail.start, "2026-08-26");
});

test("backfill stops at Google's floor and never goes past it", () => {
  const floor = shiftYmd(end, -(HISTORY_DAYS - 1));
  const p = planQueryHistory({ endStr: end, newestStr: end, historyFromStr: shiftYmd(floor, 10) });
  assert.equal(p.backfill.length, 1);
  assert.equal(p.backfill[0].start, floor);
  const done = planQueryHistory({ endStr: end, newestStr: end, historyFromStr: floor });
  assert.equal(done.backfill.length, 0);
  // days older than the floor that are already stored are simply kept: nothing plans over them
  const older = planQueryHistory({ endStr: end, newestStr: end, historyFromStr: "2024-01-01" });
  assert.equal(older.backfill.length, 0);
});

test("a cursor without rows is ignored (table emptied) — starts over from the tail", () => {
  const p = planQueryHistory({ endStr: end, newestStr: null, historyFromStr: "2025-08-01" });
  assert.equal(p.backfill[0].end, "2026-10-05");
});
