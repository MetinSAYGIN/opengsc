// Who is asking and which sites a GSC report covers — shared by the portfolio-capable reports
// (/api/gsc/decay, /striking, /cannibalization) so the guest and portfolio rules can't drift.

import { prisma } from "@/lib/prisma";
import { workspaceUserId } from "@/lib/team/workspace";

export { siteDisplayName, chunk, queryPageWindows, newestWindow, QUERY_PAGE_DAYS, type SummaryWindow } from "./reportData";

/** The workspace owner, or — via a share link — the owner of that one shared site (never 'all'). */
export async function resolveReportUserId(req: Request, siteId: string): Promise<string | null> {
  const userId = await workspaceUserId();
  if (userId) return userId;
  const shareToken = new URL(req.url).searchParams.get("shareToken") ?? "";
  if (shareToken && siteId && siteId !== "all") {
    const shared = await prisma.site.findFirst({ where: { id: siteId, shareToken, shareEnabled: true } });
    if (shared) return shared.userId;
  }
  return null;
}

/**
 * One explicit site, or the live portfolio. null = not this user's site.
 * Archived and hidden sites stay out of portfolio-wide reports; an explicit siteId still reaches
 * them on purpose.
 */
export async function resolveReportSites(userId: string, siteId: string) {
  if (siteId === "all" || !siteId) {
    return prisma.site.findMany({ where: { userId, hidden: false, archivedAt: null } });
  }
  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  return site ? [site] : null;
}

/** `sites` from a JSON body or a comma list; null = every site. */
export function parseSiteSelection(v: unknown): Set<string> | null {
  const raw = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : null;
  if (!raw) return null;
  const set = new Set(raw.map(String).map(s => s.trim()).filter(Boolean).slice(0, 20000));
  return set.size ? set : null;
}

/** Request params from a POST body or the query string, as one plain record. */
export async function reportParams(req: Request): Promise<Record<string, unknown> | null> {
  if (req.method === "POST") {
    try { return ((await req.json()) ?? {}) as Record<string, unknown>; } catch { return null; }
  }
  return Object.fromEntries(new URL(req.url).searchParams);
}

export function intParam(v: unknown, def: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Math.min(Math.max(Number.isFinite(n) ? Math.floor(n) : def, lo), hi);
}

