// Match a stored DailyMetric URL against what an MCP agent passed: a full URL, a path, or a
// fragment of one. Split out of toolsOptimize.ts so it can be tested without Prisma.

export const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

/** Lowercased path with query string, fragment and trailing slash dropped; the root stays "/". */
const normPath = (u: string) => pathOf(u.trim().toLowerCase()).split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** Lowercased host without the leading www., or null when the value carries no host at all. */
const hostOfUrl = (u: string) => {
  const m = u.trim().toLowerCase().match(/^https?:\/\/([^/?#]+)/);
  return m ? m[1].replace(/^www\./, "") : null;
};

/** sc-domain sites store rows from several subdomains, so when both sides name a host it must
 *  agree (www counts as the same); a bare path — the common "/pricing" argument, or a row stored
 *  as a path — cannot discriminate and matches any host. */
const sameHost = (stored: string, wanted: string): boolean => {
  const a = hostOfUrl(stored);
  const b = hostOfUrl(wanted);
  return !a || !b || a === b;
};

/** Same page: query string, fragment, case and trailing slash ignored; hosts compared when both
 *  sides carry one. */
export function urlMatches(stored: string, wanted: string): boolean {
  if (!stored) return false;
  return sameHost(stored, wanted) && normPath(stored) === normPath(wanted);
}

/** Loose fallback for a fragment ("pricing", "/docs/guides"): the stored path contains it. One
 *  direction only — the reverse (wanted contains stored) let the homepage, stored as
 *  "https://host/", match every URL on the site. */
export function urlFragmentMatches(stored: string, wanted: string): boolean {
  if (!stored) return false;
  if (!sameHost(stored, wanted)) return false;
  const frag = normPath(wanted);
  return frag !== "/" && normPath(stored).includes(frag.replace(/^\//, ""));
}
