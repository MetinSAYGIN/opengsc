import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveWindow, previousWindow, comparisonShift, daysParam,
  periodToDays, MAX_CUSTOM_SPAN_DAYS, DAY_MS,
  type GscWindow,
} from "./periodWindow";

// A hand-built window (resolveWindow's preset branch reads the real clock — not testable
// deterministically; the custom branch and the comparison math are).
function win(startISO: string, endISO: string): GscWindow {
  return resolveWindow("custom", startISO, endISO);
}

test("custom window keeps the picked calendar dates and counts them inclusively", () => {
  const w = win("2026-05-12", "2026-06-09");
  assert.equal(w.startStr, "2026-05-12");
  assert.equal(w.endStr, "2026-06-09");
  assert.equal(w.days, 29); // 20 days of May + 9 of June
  assert.equal(w.start.getHours(), 0);
  assert.equal(w.end.getHours(), 23);
});

test("inverted custom range clamps to the end date, one day long", () => {
  const w = win("2026-06-09", "2026-05-12");
  assert.equal(w.days, 1);
  assertSameDay(w.start, "2026-05-12");
  assert.equal(w.startStr, "2026-05-12");
});

test("over-long custom span slides its start forward to the preset ceiling", () => {
  const w = win("2000-01-01", "2026-06-09");
  assert.equal(w.days, MAX_CUSTOM_SPAN_DAYS);
  const expectedStart = new Date(new Date("2026-06-09").getTime() - (MAX_CUSTOM_SPAN_DAYS - 1) * DAY_MS)
    .toISOString().slice(0, 10);
  assert.equal(w.startStr, expectedStart);
  assert.equal(w.endStr, "2026-06-09");
});

test("custom without valid dates falls back to the 28-day default like an unknown key", () => {
  assert.equal(resolveWindow("custom", null, "2026-06-09").days, 28);
  assert.equal(resolveWindow("custom", "garbage", "2026-06-09").days, 28);
  assert.equal(resolveWindow("no-such-key").days, periodToDays("no-such-key"));
});

function assertSameDay(d: Date, iso: string) {
  assert.equal(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, iso);
}

test("previous mode sits immediately before the window", () => {
  const w = win("2026-06-01", "2026-06-07");
  const p = previousWindow(w, "previous", false);
  assert.ok(p);
  assert.equal(p.days, 7);
  assertSameDay(p.start, "2026-05-25");
  assertSameDay(p.end, "2026-05-31");
});

test("yoy mode keeps the same dates a year earlier", () => {
  const w = win("2026-06-01", "2026-06-07");
  const p = previousWindow(w, "yoy", false);
  assert.ok(p);
  assert.equal(p.days, 7);
  assertSameDay(p.start, "2025-06-01");
  assertSameDay(p.end, "2025-06-07");
});

test("prev_month mode shifts the same day-of-month back one calendar month", () => {
  const w = win("2026-06-01", "2026-06-07");
  const p = previousWindow(w, "prev_month", false);
  assert.ok(p);
  assertSameDay(p.start, "2026-05-01");
  assertSameDay(p.end, "2026-05-07");
});

test("matchWd aligns the comparison window to the same end weekday in every mode", () => {
  for (const mode of ["previous", "yoy", "prev_month"]) {
    const w = win("2026-06-01", "2026-06-07");
    const p = previousWindow(w, mode, true);
    assert.ok(p, mode);
    assert.equal(p.end.getDay(), w.end.getDay(), mode);
    // Aligned windows stay the same length as the current one
    assert.equal(p.days, w.days, mode);
  }
});

test("disabled mode has no comparison window at all", () => {
  const w = win("2026-06-01", "2026-06-07");
  assert.equal(previousWindow(w, "disabled", true), null);
  assert.equal(previousWindow(w, "garbage", false), null);
});

test("comparisonShift is the day distance between window starts", () => {
  const w = win("2026-06-01", "2026-06-07");
  const p = previousWindow(w, "previous", false);
  assert.ok(p);
  assert.equal(comparisonShift(w, p), 7);
  const y = previousWindow(w, "yoy", false);
  assert.ok(y);
  assert.equal(comparisonShift(w, y), 365);
});

test("daysParam accepts whole day counts and rejects everything else", () => {
  assert.equal(daysParam(null), null);
  assert.equal(daysParam("14"), 14);
  assert.equal(daysParam("7.6"), 8);
  assert.equal(daysParam("0"), null);
  assert.equal(daysParam("-5"), null);
  assert.equal(daysParam("abc"), null);
  assert.equal(daysParam(String(MAX_CUSTOM_SPAN_DAYS + 100)), MAX_CUSTOM_SPAN_DAYS);
});

// ── windowDays / localYmd / shiftYmd ─────────────────────────────────────────────────────
// Run under several TZ values (see the check in this change): the bug these guard against —
// toISOString() on local-midnight instants — only shows up off UTC.
import { windowDays, localYmd, shiftYmd, utcDay } from "./periodWindow";

const spanDays = (a: string, b: string) => Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / DAY_MS) + 1;

test("localYmd reads the local calendar day, not the UTC one", () => {
  assert.equal(localYmd(new Date(2026, 9, 6, 0, 0, 0, 0)), "2026-10-06");       // local midnight
  assert.equal(localYmd(new Date(2026, 9, 12, 23, 59, 59, 999)), "2026-10-12"); // local end-of-day
});

test("shiftYmd is exact across DST, month and leap-year edges", () => {
  assert.equal(shiftYmd("2026-10-25", 1), "2026-10-26");  // EU DST ends
  assert.equal(shiftYmd("2026-03-29", -1), "2026-03-28"); // EU DST starts
  assert.equal(shiftYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftYmd("2028-03-01", -1), "2028-02-29");
});

test("custom window: previous period is the same length and ends the day before", () => {
  const { curr, prev } = windowDays(win("2026-10-06", "2026-10-12"));
  assert.deepEqual(curr, { startStr: "2026-10-06", endStr: "2026-10-12" });
  assert.deepEqual(prev, { startStr: "2026-09-29", endStr: "2026-10-05" });
});

for (const period of ["yesterday", "7d", "14d", "28d", "3m", "12m"]) {
  test(`preset ${period}: exactly N days, previous period adjacent and equal (TZ=${process.env.TZ ?? "system"})`, () => {
    const w = resolveWindow(period);
    const { curr, prev } = windowDays(w);
    assert.equal(spanDays(curr.startStr, curr.endStr), w.days, "current window length");
    assert.equal(spanDays(prev.startStr, prev.endStr), w.days, "previous window length");
    assert.equal(shiftYmd(prev.endStr, 1), curr.startStr, "no overlap, no gap");
    // ends 2 days back (GSC final-data lag), in the local calendar
    const lag = new Date(); lag.setDate(lag.getDate() - 2);
    assert.equal(curr.endStr, localYmd(lag));
  });
}
