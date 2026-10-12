import test from "node:test";
import assert from "node:assert/strict";
import { computeHealthScore, isPlainInternalRedirect, pageHealthScore, WARNING_FLOOR, WARNING_PENALTY, type HealthScoreRow } from "./healthScore";
import { AUDIT_RULES } from "./rules";

const page = (url: string, issues: string[] = [], extra: Partial<HealthScoreRow> = {}): HealthScoreRow =>
  ({ url, httpStatus: 200, redirectTo: null, issues, ...extra });

test("a clean page scores 100, a critical finding scores 0 whatever else is present", () => {
  assert.equal(pageHealthScore([]), 100);
  assert.equal(pageHealthScore(["broken_links"]), 0);
  assert.equal(pageHealthScore(["images_no_alt", "http_error"]), 0);
});

test("warnings cost a fixed penalty per distinct rule and never reach the critical level", () => {
  assert.equal(pageHealthScore(["images_no_alt"]), 100 - WARNING_PENALTY);
  assert.equal(pageHealthScore(["images_no_alt", "images_no_alt"]), 100 - WARNING_PENALTY);
  assert.equal(pageHealthScore(["images_no_alt", "title_too_short", "description_too_long"]), 100 - 3 * WARNING_PENALTY);
  const everyWarning = AUDIT_RULES.filter(rule => rule.severity === "warning").map(rule => rule.id);
  assert.equal(pageHealthScore(everyWarning), WARNING_FLOOR);
});

test("info and affectsScore:false rules cost nothing", () => {
  assert.equal(pageHealthScore(["open_graph_incomplete", "twitter_card_incomplete", "lang_missing"]), 100);
  assert.equal(pageHealthScore(["canonical_missing", "cwv_poor", "security_headers_missing"]), 100);
});

test("plain internal redirects leave the average; chains, loops and off-site redirects stay", () => {
  const r = (to: string, issues = ["redirect"]) => page("http://example.com/a", issues, { httpStatus: 301, redirectTo: to });
  assert.equal(isPlainInternalRedirect(r("https://example.com/a")), true);
  assert.equal(isPlainInternalRedirect(r("https://www.example.com/a/")), true);
  assert.equal(isPlainInternalRedirect(r("/a/")), true);
  assert.equal(isPlainInternalRedirect(r("https://other.com/")), false);
  assert.equal(isPlainInternalRedirect(r("https://example.com/b", ["redirect", "redirect_chain"])), false);
  assert.equal(isPlainInternalRedirect(r("https://example.com/b", ["redirect", "redirect_loop"])), false);
  assert.equal(isPlainInternalRedirect(r("https://example.com/b", ["redirect", "slow_response"])), false);
  assert.equal(isPlainInternalRedirect(page("https://example.com/", ["redirect"], { httpStatus: 301, redirectTo: null })), false);
});

test("issue #30: three 200 pages with minor warnings and one plain 301 no longer score 0", () => {
  const rows = [
    page("https://example.com/", ["images_no_alt", "viewport_missing", "open_graph_incomplete", "internal_redirect_links"]),
    page("https://example.com/about/", ["title_too_short", "description_too_long", "twitter_card_incomplete"]),
    page("https://example.com/contact/", ["images_no_alt", "description_too_short", "internal_redirect_links"]),
    page("https://example.com/contact", ["redirect"], { httpStatus: 301, redirectTo: "https://example.com/contact/" }),
  ];
  const result = computeHealthScore(rows);
  assert.equal(result.healthScoreV1, 0);
  assert.equal(result.scoredPages, 3);
  assert.equal(result.redirectsExcluded, 1);
  assert.equal(result.healthScore, Math.round(((100 - 24) + (100 - 16) + (100 - 24)) / 3));
  assert.ok(result.healthScore >= 50, "must stay clear of the default alert threshold");
});

test("a site with broken pages still scores low", () => {
  const rows = [
    page("https://example.com/", ["broken_links"]),
    page("https://example.com/x", ["http_error"], { httpStatus: 404 }),
    page("https://example.com/y"),
    page("https://example.com/z", ["images_no_alt"]),
  ];
  assert.equal(computeHealthScore(rows).healthScore, Math.round((0 + 0 + 100 + 92) / 4));
});

test("empty crawl stays 0; a crawl of nothing but clean internal redirects is 100", () => {
  assert.equal(computeHealthScore([]).healthScore, 0);
  const onlyRedirect = [page("http://example.com/", ["redirect"], { httpStatus: 301, redirectTo: "https://example.com/" })];
  assert.equal(computeHealthScore(onlyRedirect).healthScore, 100);
});

test("v2 is never below v1 on the same rows, so recomputing old audits cannot trigger new alerts", () => {
  const ids = AUDIT_RULES.map(rule => rule.id);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  for (let run = 0; run < 500; run++) {
    const rows: HealthScoreRow[] = Array.from({ length: 1 + Math.floor(rand() * 12) }, (_, i) => {
      const redirect = rand() < 0.2;
      const issues = redirect ? ["redirect", ...(rand() < 0.3 ? ["redirect_chain"] : [])]
        : ids.filter(() => rand() < 0.06);
      return page(`https://example.com/p${i}`, issues, redirect
        ? { httpStatus: 301, redirectTo: rand() < 0.8 ? `https://example.com/q${i}` : "https://elsewhere.org/" }
        : {});
    });
    const result = computeHealthScore(rows);
    assert.ok(result.healthScore >= result.healthScoreV1, JSON.stringify({ rows, result }));
  }
});

test("the numbers quoted in the export note and the UI hint match the constants", () => {
  // exportMd.ts and the auditHealthScoreHint locale strings spell out 8 and 40 literally.
  assert.equal(WARNING_PENALTY, 8);
  assert.equal(WARNING_FLOOR, 40);
});
