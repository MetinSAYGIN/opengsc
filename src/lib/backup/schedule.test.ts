import assert from "node:assert/strict";
import test from "node:test";
import { dueFire } from "./due";

const T = (iso: string) => new Date(Date.parse(iso));

test("fires when a scheduled minute is inside the lookback window and nothing ran yet", () => {
  // 03:00 daily, tick at 03:30 — the 03:00 fire is 30 minutes back, inside the window.
  const fire = dueFire("0 3 * * *", null, T("2026-10-12T03:30:00Z"));
  assert.ok(fire);
  assert.equal(fire.toISOString(), "2026-10-12T03:00:00.000Z");
});

test("enabling far from the schedule does not fire a surprise backup", () => {
  // Daily 03:00, tick at 21:00 — the window is 60 minutes, the last fire is 18 hours back:
  // deliberately missed, exactly like the geo-grid presets.
  assert.equal(dueFire("0 3 * * *", null, T("2026-10-12T21:00:00Z")), null);
});

test("the high-water suppresses the fire already acted on", () => {
  const last = "2026-10-12T03:00:00.000Z";
  assert.equal(dueFire("0 3 * * *", last, T("2026-10-12T03:30:00Z")), null);
});

test("a newer fire is due again even after a failed previous run", () => {
  // The high-water advances on failure too (one attempt per fire) — the next day must fire.
  const last = "2026-10-12T03:00:00.000Z";
  const fire = dueFire("0 3 * * *", last, T("2026-10-13T03:20:00Z"));
  assert.ok(fire);
  assert.equal(fire.toISOString(), "2026-10-13T03:00:00.000Z");
});

test("step schedules fire on each step", () => {
  const a = dueFire("0 3,15 * * *", "2026-10-12T03:00:00.000Z", T("2026-10-12T15:10:00Z"));
  assert.equal(a?.toISOString(), "2026-10-12T15:00:00.000Z");
  assert.equal(dueFire("0 3,15 * * *", "2026-10-12T15:00:00.000Z", T("2026-10-12T16:10:00Z")), null);
});

test("an invalid expression never fires (validateCron gates it on save; this is defense)", () => {
  assert.equal(dueFire("not a cron", null, T("2026-10-12T03:30:00Z")), null);
});
