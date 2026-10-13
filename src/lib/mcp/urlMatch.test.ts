// get_optimization_brief page matching. The bug this pins: the homepage, stored as
// "https://host/", is a substring of every URL on the site, so the old two-way `includes`
// matched it against whatever page the agent asked about — and the brief came back with the
// homepage's queries, cannibalization rivals and live content.
import { test } from "node:test";
import assert from "node:assert/strict";

import { urlMatches, urlFragmentMatches } from "./urlMatch";

test("the homepage does not match a deeper page", () => {
  assert.equal(urlMatches("https://ex.com/", "https://ex.com/arch-linux-vps"), false);
  assert.equal(urlMatches("https://ex.com/", "/docs/guides/forex"), false);
});

test("full URL, path and trailing slash name the same page", () => {
  assert.equal(urlMatches("https://ex.com/pricing/", "/pricing"), true);
  assert.equal(urlMatches("https://ex.com/pricing", "https://ex.com/pricing/"), true);
  assert.equal(urlMatches("https://ex.com/Pricing?utm=x#top", "https://ex.com/pricing"), true);
  assert.equal(urlMatches("https://ex.com/", "https://ex.com"), true);
  assert.equal(urlMatches("https://ex.com/", "/"), true);
});

test("siblings sharing a prefix are different pages", () => {
  assert.equal(urlMatches("https://ex.com/pricing-old", "/pricing"), false);
  assert.equal(urlMatches("https://ex.com/de/pricing", "/pricing"), false);
});

test("empty stored URLs (site rollup rows) never match", () => {
  assert.equal(urlMatches("", "/"), false);
  assert.equal(urlFragmentMatches("", "pricing"), false);
});

test("fragment fallback is one-way and never lets the root swallow everything", () => {
  assert.equal(urlFragmentMatches("https://ex.com/arch-linux-vps", "arch"), true);
  assert.equal(urlFragmentMatches("https://ex.com/docs/guides/x", "/docs/guides"), true);
  assert.equal(urlFragmentMatches("https://ex.com/", "arch"), false);
  assert.equal(urlFragmentMatches("https://ex.com/arch-linux-vps", "/"), false);
  assert.equal(urlFragmentMatches("https://ex.com/arch", "https://ex.com/arch-linux-vps"), false);
});
