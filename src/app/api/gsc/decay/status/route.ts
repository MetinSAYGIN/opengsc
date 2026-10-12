// POST /api/gsc/decay/status  { items: [{ siteId, url }] }  →  { results: HttpCheckResult[] }
//
// HTTP status + redirect chain for pages listed in the Content Decay table (#28).
//
// Only URLs this workspace already has Search Console rows for are fetched. That is the whole
// authorisation model for the outbound request: the caller can make the server fetch "a page of
// my own site that Google reported", never an arbitrary address — so this is not an open proxy,
// even before safeFetch's private-address guard runs on every hop.
//
// "act", not "read": it makes outbound requests on the owner's behalf. Share-link guests and
// viewers see the table but don't get the button.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/team/workspace";
import { checkHttpStatus, mapLimit } from "@/lib/decay/httpCheck";
import type { HttpCheckResult } from "@/lib/decay/logic";

/** Per request. The UI sends batches of this size and shows progress between them. */
const MAX_ITEMS = 20;
const CONCURRENCY = 5;

export async function POST(req: Request) {
  const guard = await requireWorkspace("act");
  if (!guard.ok) return guard.response;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw) || raw.length === 0) return NextResponse.json({ error: "items_required" }, { status: 400 });
  if (raw.length > MAX_ITEMS) return NextResponse.json({ error: "too_many_items", max: MAX_ITEMS }, { status: 400 });

  const all = raw.map(i => ({
    siteId: String((i as { siteId?: unknown })?.siteId ?? ""),
    url: String((i as { url?: unknown })?.url ?? ""),
  }));
  const items = all.filter(i => i.siteId && /^https?:\/\//i.test(i.url) && i.url.length <= 2048);

  // Sites must belong to this workspace…
  const siteIds = [...new Set(items.map(i => i.siteId))];
  const owned = await prisma.site.findMany({ where: { id: { in: siteIds }, userId: guard.ws.ownerId }, select: { id: true } });
  const ownedIds = new Set(owned.map(s => s.id));

  // …and each URL must be one Search Console reported for that site.
  const known = new Set<string>();
  for (const siteId of ownedIds) {
    const urls = items.filter(i => i.siteId === siteId).map(i => i.url);
    const rows = await prisma.dailyMetric.findMany({
      where: { siteId, url: { in: urls } },
      select: { url: true },
      distinct: ["url"],
    });
    for (const r of rows) known.add(`${siteId}\n${r.url}`);
  }

  const results = await mapLimit(all, CONCURRENCY, async (i): Promise<HttpCheckResult & { siteId: string }> => {
    if (!known.has(`${i.siteId}\n${i.url}`)) {
      return { siteId: i.siteId, url: i.url, status: 0, chain: [], finalUrl: null, finalStatus: null, verdict: "error", error: "unknown_url" };
    }
    return { siteId: i.siteId, ...(await checkHttpStatus(i.url)) };
  });

  return NextResponse.json({ results, checkedAt: new Date().toISOString() });
}
