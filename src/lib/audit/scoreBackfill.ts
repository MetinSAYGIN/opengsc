import { prisma } from "@/lib/prisma";
import { computeHealthScore, HEALTH_SCORE_VERSION } from "./healthScore";

const BATCH = 25;
const VERSION_MARK = `"scoreVersion":${HEALTH_SCORE_VERSION}`;

/**
 * One-time, idempotent recomputation of stored health scores to the current formula.
 *
 * Every SiteAuditPage row keeps its issue codes, so an old audit can be rescored exactly rather
 * than left on the old scale — otherwise the history chart would show a jump on update day that
 * no change to the site caused. The previous value stays in the summary as `healthScoreV1`.
 * Runs at boot from the audit scheduler. Audits already carrying the version mark are filtered
 * out in the query, so after the first pass a boot costs one query that returns nothing (plus
 * any audit whose page rows are gone, which is skipped every time and never rewritten).
 *
 * Safe for alerts: v2 ≥ v1 on the same rows (see healthScore.test.ts), and the low-score alert
 * dedupes per audit id, so no audit can newly cross the threshold because of this pass.
 */
export async function backfillHealthScores(): Promise<number> {
  let updated = 0;
  let cursor: string | undefined;
  for (;;) {
    const audits: { id: string; summary: string | null }[] = await prisma.siteAudit.findMany({
      // Keyset paging on id rather than a Prisma cursor: rows this loop rewrites stop matching the
      // filter, and a cursor pointing at such a row is not something to rely on.
      where: {
        status: "completed",
        summary: { not: null },
        NOT: { summary: { contains: VERSION_MARK } },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, summary: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (!audits.length) break;
    cursor = audits[audits.length - 1].id;
    for (const audit of audits) {
      if (!audit.summary || audit.summary.includes(VERSION_MARK)) continue;
      let summary: Record<string, unknown>;
      try { summary = JSON.parse(audit.summary); } catch { continue; }
      if (!summary || typeof summary !== "object") continue;
      const pages = await prisma.siteAuditPage.findMany({
        where: { auditId: audit.id },
        select: { url: true, httpStatus: true, redirectTo: true, issues: true },
      });
      // An audit whose page rows are gone cannot be rescored honestly — leave its number alone.
      if (!pages.length) continue;
      const rows = pages.map((p: { url: string; httpStatus: number; redirectTo: string | null; issues: string | null }) => {
        let issues: string[] = [];
        try { const parsed = p.issues ? JSON.parse(p.issues) : []; if (Array.isArray(parsed)) issues = parsed; } catch { /* corrupt row: no issues */ }
        return { url: p.url, httpStatus: p.httpStatus, redirectTo: p.redirectTo, issues };
      });
      const score = computeHealthScore(rows);
      const next = {
        ...summary,
        healthScore: score.healthScore,
        // Keep what was actually stored at the time, not a recomputation of it.
        healthScoreV1: typeof summary.healthScore === "number" ? summary.healthScore : score.healthScoreV1,
        scoreVersion: score.scoreVersion,
        scoredPages: score.scoredPages,
        redirectsExcluded: score.redirectsExcluded,
      };
      await prisma.siteAudit.update({ where: { id: audit.id }, data: { summary: JSON.stringify(next) } });
      updated++;
    }
  }
  if (updated) console.log(`[audit] health score v${HEALTH_SCORE_VERSION}: rescored ${updated} stored audit(s)`);
  return updated;
}
