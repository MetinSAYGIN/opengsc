// Match a stored DailyMetric URL against what an MCP agent passed: a full URL, a path, or a
// fragment of one. Split out of toolsOptimize.ts so it can be tested without Prisma.

export const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

/** Lowercased path with query string, fragment and trailing slash dropped; the root stays "/". */
const normPath = (u: string) => pathOf(u.trim().toLowerCase()).split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** Same page: host, query string, fragment, case and trailing slash ignored. */
export function urlMatches(stored: string, wanted: string): boolean {
  if (!stored) return false;
  return normPath(stored) === normPath(wanted);
}

/** Loose fallback for a fragment ("pricing", "/docs/guides"): the stored path contains it. One
 *  direction only — the reverse (wanted contains stored) let the homepage, stored as
 *  "https://host/", match every URL on the site. */
export function urlFragmentMatches(stored: string, wanted: string): boolean {
  if (!stored) return false;
  const frag = normPath(wanted);
  return frag !== "/" && normPath(stored).includes(frag.replace(/^\//, ""));
}
