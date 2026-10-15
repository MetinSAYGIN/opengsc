// Parsing the buy modal's rows for quote and submit — one place, so the amount the operator
// is quoted and the amount checked at the pay boundary come from identically parsed rows.
//
// Article providers (FieldLink, 369Team articles) need a language on every row. 369Team
// homepage links have no language at all, but carry an optional surrounding text with the
// $LINK placeholder and stricter anchor rules, which are checked here before any money moves.

import { validateBrief, contentHintProblem, AVAILABLE_LINK_TIERS, type FieldLinkBrief } from "./fieldlink";
import { linkRowProblem } from "./magic369";

export interface ParsedItem extends FieldLinkBrief {
  /** 369Team links only: surrounding text with $LINK, or "" for a bare link. */
  text: string;
  /** FieldLink links only: traffic tier id and the optional "what to write about" hint. */
  tier: string;
  contentHint: string;
}

export function parseRequestItems(raw: unknown, opts: { links: boolean; flLinks?: boolean }): ParsedItem[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "empty selection";
  const out: ParsedItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown> | null;
    const language = String(r?.language ?? "").trim();
    try {
      const brief = validateBrief({
        targetUrl: String(r?.targetUrl ?? ""),
        query: String(r?.query ?? ""),
        anchor: String(r?.anchor ?? r?.query ?? ""),
        // Links have no language; validateBrief insists on one, so a known placeholder passes
        // its check and is dropped right after — it never reaches the service or the ledger.
        language: opts.links ? "en" : language,
        count: Number(r?.count),
      }, i);
      const text = opts.links ? String(r?.text ?? "").trim() : "";
      if (opts.links) {
        const problem = linkRowProblem({ anchor: brief.anchor, text });
        if (problem) return `row ${i + 1}: ${problem}`;
      }
      let tier = "";
      let contentHint = "";
      if (opts.flLinks) {
        tier = String(r?.tier ?? "").trim();
        if (!AVAILABLE_LINK_TIERS.has(tier)) return `row ${i + 1}: traffic tier "${tier || "empty"}" is not available`;
        contentHint = String(r?.contentHint ?? "").replace(/\s+/g, " ").trim();
        const hp = contentHintProblem(contentHint);
        if (hp) return `row ${i + 1}: ${hp}`;
      }
      out.push({ ...brief, language: opts.links ? "" : brief.language, text, tier, contentHint });
    } catch (e) {
      return (e as Error).message;
    }
  }
  return out;
}
