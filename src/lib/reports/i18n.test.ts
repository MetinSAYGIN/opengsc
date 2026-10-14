// Issue #36 — the report language layer: normalization, the option list the editor
// renders, and structural parity of the language blocks (every language speaks about
// every section — a missing title would render as "undefined" in a client snapshot).
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReportLang, REPORT_LANG_OPTIONS, REPORT_L, REPORT_FMT_INT, type ReportLang } from "./i18n";
import { REPORT_SECTION_IDS } from "./sections";

const ALL: ReportLang[] = ["en", "ru", "uk", "fr", "es", "de", "zh", "nl"];

test("normalizeReportLang: known codes pass, everything else falls back to en", () => {
  assert.equal(normalizeReportLang("nl"), "nl");
  assert.equal(normalizeReportLang("de"), "de");
  assert.equal(normalizeReportLang("EN"), "en"); // case-sensitive: no silent dialect guessing
  assert.equal(normalizeReportLang("pt"), "en");
  assert.equal(normalizeReportLang(undefined), "en");
  assert.equal(normalizeReportLang(42), "en");
});

test("REPORT_LANG_OPTIONS offers exactly the eight supported languages, en first", () => {
  assert.deepEqual(REPORT_LANG_OPTIONS.map(o => o.value), ALL);
});

test("every language block titles all fourteen sections (no undefined in a snapshot)", () => {
  for (const lang of ALL) {
    const titles = REPORT_L[lang].sectionTitles;
    for (const id of REPORT_SECTION_IDS) {
      assert.ok(typeof titles[id] === "string" && titles[id].trim().length > 0, `${lang}.${id}`);
    }
  }
});

test("integer formatting follows the language: 1,180 en vs 1.180 nl vs 1 180 ru", () => {
  assert.equal(REPORT_FMT_INT.en(1180), "1,180");
  assert.equal(REPORT_FMT_INT.nl(1180), "1.180");
  assert.equal(REPORT_FMT_INT.ru(1180).replace(/\u00a0/g, " "), "1 180");
});
