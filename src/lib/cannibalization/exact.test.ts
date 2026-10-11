import { test } from "node:test";
import assert from "node:assert/strict";
import { brandTermsOf, buildExactGroups, type QueryPageRow } from "./exact";

const ctx = { siteId: "s1", siteName: "skgclean.gr", brand: ["skgclean"], minImpressions: 30 };
const row = (query: string, url: string, impressions: number, position: number, clicks = 0): QueryPageRow =>
  ({ query, url, impressions, position, clicks, ctr: impressions ? clicks / impressions : 0 });

test("brand terms: first host label, never shorter than 3", () => {
  assert.deepEqual(brandTermsOf("sc-domain:skgclean.gr"), ["skgclean"]);
  assert.deepEqual(brandTermsOf("https://www.Example.com/"), ["example"]);
  assert.deepEqual(brandTermsOf("sc-domain:a.gr"), [], "a 1-letter brand would swallow every query");
  assert.deepEqual(brandTermsOf("http://staging.local:3000/"), ["staging"], "port stripped");
});

test("two pages splitting a query make a group; shares and totals are of the competing pages", () => {
  const g = buildExactGroups([
    row("house cleaning thessaloniki", "https://x.gr/a", 300, 6, 12),
    row("house cleaning thessaloniki", "https://x.gr/b", 100, 9, 2),
    row("house cleaning thessaloniki", "https://x.gr/c", 10, 40),   // < 10% share → dropped
  ], ctx);
  assert.equal(g.length, 1);
  assert.equal(g[0].pages.length, 2);
  assert.deepEqual(g[0].pages.map(p => p.url), ["/a", "/b"]);
  assert.deepEqual(g[0].pages.map(p => p.share), [75, 25]);
  assert.equal(g[0].impressions, 400);
  assert.equal(g[0].clicks, 14);
  assert.equal(g[0].siteId, "s1");
});

test("filters: brand, volume, one page, far-apart positions", () => {
  assert.equal(buildExactGroups([row("skgclean prices", "https://x.gr/a", 300, 3), row("skgclean prices", "https://x.gr/b", 300, 4)], ctx).length, 0, "branded");
  assert.equal(buildExactGroups([row("q", "https://x.gr/a", 10, 3), row("q", "https://x.gr/b", 10, 4)], ctx).length, 0, "below minImpressions");
  assert.equal(buildExactGroups([row("q", "https://x.gr/a", 300, 3)], ctx).length, 0, "one page");
  assert.equal(buildExactGroups([row("q", "https://x.gr/a", 300, 3), row("q", "https://x.gr/b", 300, 30)], ctx).length, 0, "27 positions apart");
});

test("true cannibalization when the pages' own top queries overlap", () => {
  const g = buildExactGroups([
    row("deep cleaning service", "https://x.gr/a", 500, 5),
    row("deep cleaning service", "https://x.gr/b", 400, 7),
    row("deep cleaning prices", "https://x.gr/b", 900, 4),   // /b's own top query, overlaps "cleaning"
    row("office moving", "https://x.gr/c", 100, 8),
  ], ctx);
  const grp = g.find(x => x.query === "deep cleaning service")!;
  assert.equal(grp.isTrue, true);
  assert.equal(grp.pages.find(p => p.url === "/b")!.topQuery, "deep cleaning prices");
});

test("a repeated (query, url) row is folded, not counted as a second page", () => {
  const g = buildExactGroups([row("q one", "https://x.gr/a", 100, 4), row("q one", "https://x.gr/a", 100, 6)], ctx);
  assert.equal(g.length, 0);
});
