/**
 * The document head as a byte window.
 *
 * Every metadata signal (title, meta, link tags) lives in the head, but page builders like Divi
 * ship megabytes of inline CSS before half of those tags: tantist.be (issue #30) prints its
 * viewport meta at byte 266k of a 284k head, and the old fixed 200k window reported "no viewport"
 * on pages that had one. The window therefore follows the actual `</head>` boundary; the 200k cap
 * survives only as the fallback for malformed HTML with no closing tag.
 */
export function headWindow(html: string): string {
  const end = /<\/head\s*>/i.exec(html);
  return end ? html.slice(0, end.index + end[0].length) : html.slice(0, 200_000);
}
