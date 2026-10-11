import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDecay, compareDecay, decayWindows, httpVerdict, isoDay, pagePath, redirectHops, toCsv,
} from "./logic";

test("windows: equal, complete, contiguous, anchored to the data not to today", () => {
  const w = decayWindows(new Date("2026-10-09T00:00:00Z"), "month")!;
  // 2 provisional days dropped: Oct 9 data → window ends Oct 7
  assert.equal(isoDay(w.current.end), "2026-10-07");
  assert.equal(isoDay(w.current.start), "2026-08-13"); // 56 days inclusive
  assert.equal(isoDay(w.previous.end), "2026-08-12");
  assert.equal(isoDay(w.previous.start), "2026-06-18");
  assert.equal(w.days, 56);
  const len = (r: { start: Date; end: Date }) => (r.end.getTime() - r.start.getTime()) / 86_400_000 + 1;
  assert.equal(len(w.current), 56);
  assert.equal(len(w.previous), 56);
  // year ago keeps the weekday: 364 days back
  assert.equal(w.yearAgo.start.getUTCDay(), w.current.start.getUTCDay());
  assert.equal(isoDay(w.yearAgo.end), "2025-10-08");
});

test("windows: week period is 14 days a side; no data → null", () => {
  const w = decayWindows(new Date("2026-10-09T00:00:00Z"), "week")!;
  assert.equal(isoDay(w.current.start), "2026-09-24");
  assert.equal(isoDay(w.previous.start), "2026-09-10");
  assert.equal(decayWindows(null, "week"), null);
  assert.equal(decayWindows(new Date("nope"), "week"), null);
});

test("windows: a time-of-day on the anchor doesn't shift the day", () => {
  const a = decayWindows(new Date("2026-10-09T23:59:59Z"), "week")!;
  const b = decayWindows(new Date("2026-10-09T00:00:00Z"), "week")!;
  assert.equal(isoDay(a.current.end), isoDay(b.current.end));
});

test("classify: floor, thresholds, Lost", () => {
  assert.equal(classifyDecay({ current: 1, previous: 4, yearAgo: null }, 5), null, "below the floor is noise");
  assert.equal(classifyDecay({ current: 96, previous: 100, yearAgo: null }, 5), null, "-4% is not decay");
  assert.equal(classifyDecay({ current: 95, previous: 100, yearAgo: null }, 5)!.status, "Warning");
  assert.equal(classifyDecay({ current: 76, previous: 100, yearAgo: null }, 5)!.status, "Warning");
  assert.equal(classifyDecay({ current: 75, previous: 100, yearAgo: null }, 5)!.status, "Critical");
  const lost = classifyDecay({ current: 0, previous: 40, yearAgo: null }, 5)!;
  assert.equal(lost.status, "Lost");
  assert.equal(lost.changePct, -100);
  assert.equal(lost.change, -40);
  assert.equal(classifyDecay({ current: 200, previous: 100, yearAgo: null }, 5), null, "growth is not decay");
  assert.equal(classifyDecay({ current: 0, previous: 0, yearAgo: null }, 0), null, "floor never drops below 1");
});

test("classify: Lost is judged on the tail of the window, not the whole window", () => {
  // died three weeks into an 8-week window: still has traffic in the window, none in the tail
  const v = classifyDecay({ current: 30, previous: 100, yearAgo: null, tail: 0 }, 5)!;
  assert.equal(v.status, "Lost");
  assert.equal(v.changePct, -70, "the numbers still describe the whole window");
  assert.equal(classifyDecay({ current: 30, previous: 100, yearAgo: null, tail: 2 }, 5)!.status, "Critical");
  // a page that grew can't be Lost even with a quiet tail
  assert.equal(classifyDecay({ current: 150, previous: 100, yearAgo: null, tail: 0 }, 5), null);
});

test("windows: the Lost tail is the last 14 days, or the whole window when shorter", () => {
  const m = decayWindows(new Date("2026-10-09T00:00:00Z"), "month")!;
  assert.equal(isoDay(m.tail.end), "2026-10-07");
  assert.equal(isoDay(m.tail.start), "2026-09-24");
  const w = decayWindows(new Date("2026-10-09T00:00:00Z"), "week")!;
  assert.equal(isoDay(w.tail.start), isoDay(w.current.start));
});

test("classify: YoY only when a year-ago value exists and is non-zero", () => {
  assert.equal(classifyDecay({ current: 50, previous: 100, yearAgo: 200 }, 5)!.yoyPct, -75);
  assert.equal(classifyDecay({ current: 50, previous: 100, yearAgo: 0 }, 5)!.yoyPct, null);
  assert.equal(classifyDecay({ current: 50, previous: 100, yearAgo: null }, 5)!.yoyPct, null);
});

test("sort: biggest absolute loss first", () => {
  const rows = [
    { status: "Critical" as const, change: -6, changePct: -60 },
    { status: "Warning" as const, change: -800, changePct: -40 },
    { status: "Lost" as const, change: -50, changePct: -100 },
  ];
  assert.deepEqual([...rows].sort(compareDecay).map(r => r.change), [-800, -50, -6]);
});

test("pagePath", () => {
  assert.equal(pagePath("https://example.com/a/b?x=1"), "/a/b?x=1");
  assert.equal(pagePath("https://example.com"), "/");
  assert.equal(pagePath("HTTP://Example.com/x"), "/x");
});

test("http verdict: a redirect is judged by where it lands", () => {
  assert.equal(httpVerdict(200, 200), "ok");
  assert.equal(httpVerdict(301, 200), "redirect");
  assert.equal(httpVerdict(301, 404), "client_error");
  assert.equal(httpVerdict(302, 503), "server_error");
  assert.equal(httpVerdict(301, null), "error", "redirect we couldn't follow");
  assert.equal(httpVerdict(404, 404), "client_error");
  assert.equal(httpVerdict(410, 410), "client_error");
  assert.equal(httpVerdict(500, 500), "server_error");
  assert.equal(httpVerdict(0, null), "error");
  assert.equal(httpVerdict(304, 304), "ok");
});

test("redirect hops", () => {
  assert.equal(redirectHops({ chain: [{ url: "a", status: 301 }, { url: "b", status: 301 }, { url: "c", status: 200 }] }), 2);
  assert.equal(redirectHops({ chain: [{ url: "a", status: 200 }] }), 0);
});

test("csv: BOM, quoting, formula defusing, numbers untouched", () => {
  const csv = toCsv(["URL", "n"], [["https://x.com/a,b", -5], ["=HYPERLINK(\"evil\")", 3], ['say "hi"', null], ["-cmd", 0]]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], "URL,n");
  assert.equal(lines[1], '"https://x.com/a,b",-5', "negative NUMBERS are not defused");
  assert.equal(lines[2], `"'=HYPERLINK(""evil"")",3`);
  assert.equal(lines[3], '"say ""hi""",');
  assert.equal(lines[4], `"'-cmd",0`);
});
