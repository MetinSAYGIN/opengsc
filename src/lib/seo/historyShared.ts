// Pure mappers shared by the browser History cache (src/lib/seo/history.ts, jobs.ts) and the
// server-side job→history bridge (src/lib/seo/historyServer.ts). No imports at all — this file
// is pulled into both a client bundle and API routes, so it must stay dependency-free.

// Job types (SeoJob.type) → History record types. outline_auto (batch SERP→scrape→outline)
// lands in History as a regular outline; anything absent here has no History representation.
export const HISTORY_TYPE: Record<string, string> = {
  outline: "outline", outline_auto: "outline", text: "text",
  analysis: "analysis", landing: "landing", cluster: "cluster",
};

export interface SeoDiagnostics {
  mechanics?: { code: string; detail: string; fixed?: boolean; samples?: string[] }[];
  judgeConcerns?: string[];
  usedSources?: number;
  autoCleaned?: boolean;
  incomplete?: boolean;
  missingHeadings?: string[];
  /** Layer A marks scrub (marksScrub.ts): what the final text was carrying before the strip. */
  marksScrub?: { total: number; byClass: Record<string, number> };
  /**
   * Meta-tag length fitting (metaFit.ts, wave-oct T1): how the head block's Title/Description
   * were brought inside the target band. Structural mirror of MetaFitResult from
   * metaLimits.ts — duplicated inline because this file must stay import-free (it is pulled
   * into both a client bundle and API routes).
   */
  metaFit?: { field: "title" | "description"; before: string; after: string; length: number; method: string; inBand: boolean; auditOk: boolean }[];
}

// A text record keeps only the article STRING in `data`, so everything the generator reported
// alongside it — the mechanics audit, the QA reviewer's soft findings, how many sources
// grounded it — must be carried in meta.diagnostics or it is dropped at import.
//
// Structural slice of the generator's text result this mapper reads (mechanics/judge fields are
// validated at runtime below, so they stay `unknown`; only what is dereferenced needs a shape).
// Duplicated inline rather than imported because this file must stay import-free.
interface TextResultSlice {
  mechanics?: unknown;
  judgeConcerns?: unknown;
  usedSources?: unknown;
  autoCleaned?: unknown;
  incomplete?: boolean;
  missingHeadings?: unknown;
  marksScrub?: { total: number };
  metaFit?: unknown;
}

export function textDiagnostics(result: unknown): SeoDiagnostics | null {
  if (!result || typeof result !== "object") return null;
  const r = result as TextResultSlice;
  const diag: Record<string, unknown> = {
    ...(Array.isArray(r.mechanics) ? { mechanics: r.mechanics as SeoDiagnostics["mechanics"] } : {}),
    ...(Array.isArray(r.judgeConcerns) ? { judgeConcerns: r.judgeConcerns as string[] } : {}),
    ...(typeof r.usedSources === "number" ? { usedSources: r.usedSources } : {}),
    ...(r.autoCleaned ? { autoCleaned: true } : {}),
    ...(r.incomplete ? { incomplete: true, missingHeadings: r.missingHeadings ?? [] } : {}),
    ...(r.marksScrub && r.marksScrub.total > 0 ? { marksScrub: r.marksScrub } : {}),
    ...(Array.isArray(r.metaFit) ? { metaFit: r.metaFit as SeoDiagnostics["metaFit"] } : {}),
  };
  return Object.keys(diag).length ? (diag as SeoDiagnostics) : null;
}
