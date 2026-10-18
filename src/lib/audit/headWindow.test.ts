import test from "node:test";
import assert from "node:assert/strict";
import { headWindow } from "./headWindow";
import { extractAuditHtml } from "./pageSignals";
import { parseHreflangHead } from "./hreflang";

// tantist.be (issue #30): a Divi head is ~284 KB of inline CSS with the viewport meta at ~267 KB —
// past the old fixed 200 KB window, which reported "no viewport" on pages that had one.
const fatHead = (meta: string) =>
  `<html><head><title>Fat head</title><style>${"/* padding */ ".repeat(24_000)}</style>${meta}</head><body><h1>x</h1></body></html>`;

test("headWindow follows the actual </head> boundary, keeping 200k only as the no-close-tag fallback", () => {
  const html = fatHead(`<meta name="viewport" content="width=device-width">`);
  assert.ok(html.length > 210_000);
  assert.match(headWindow(html), /name="viewport"/);
  assert.match(headWindow(html), /<\/head>$/);
  assert.equal(headWindow("<html><head><title>broken"), "<html><head><title>broken".slice(0, 200_000));
});

test("extractAuditHtml finds viewport and hreflang past 200 KB of head (tantist.be regression)", () => {
  const signals = extractAuditHtml(fatHead(
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">` +
    `<link rel="alternate" hreflang="nl" href="https://example.com/nl/">`,
  ));
  assert.equal(signals.viewportPresent, true);
  // The same tag is still judged non-responsive — maximum-scale=1 / user-scalable=0 block zoom.
  assert.equal(signals.viewportResponsive, false);
  assert.equal(signals.title, "Fat head");
  assert.deepEqual(signals.hreflang, [{ lang: "nl", href: "https://example.com/nl/" }]);
});

test("parseHreflangHead alone reads link tags from a fat head", () => {
  const entries = parseHreflangHead(fatHead(`<link rel="alternate" hreflang="en" href="https://example.com/en/">`));
  assert.deepEqual(entries, [{ lang: "en", href: "https://example.com/en/" }]);
});
