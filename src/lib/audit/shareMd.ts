// Server-side share links that serve an audit's markdown report over HTTP.
//
// The client export downloads a file; this module mints a signed URL (/share/audit/<id>.<sig>.md)
// an operator can hand to an AI agent or a developer directly — no download/re-upload round
// trip. The signature is an HMAC of the audit id under NEXTAUTH_SECRET (the same secret and
// the same threat model the session cookies use), so a link opens exactly one audit and can
// be minted only by someone who can already read it. Responses carry X-Robots-Tag: noindex.

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildAuditMarkdown } from "./exportMd";
import { AUDIT_RULES } from "./rules";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import uk from "@/locales/uk.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import de from "@/locales/de.json";
import zh from "@/locales/zh.json";

const dictionaries = { en, ru, uk, fr, es, de, zh } as const;
export type MdLang = keyof typeof dictionaries;
const MD_LANGS = Object.keys(dictionaries) as MdLang[];

export function normalizeMdLang(raw: string | null | undefined): MdLang {
  const v = (raw ?? "").trim().toLowerCase();
  return (MD_LANGS as string[]).includes(v) ? (v as MdLang) : "en";
}

// Prisma cuid ids are alphanumeric; the signature is base64url — the only "." in a token
// separates the two, and an optional ".md" suffix rides at the end for the reader's eye.
const SIG_LEN = 22;

const secret = () => process.env.NEXTAUTH_SECRET ?? "";

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url").slice(0, SIG_LEN);

export function mintAuditMdToken(id: string): string {
  return `${id}.${sign(id)}`;
}

/** Accepts "<id>.<sig>" and "<id>.<sig>.md"; returns the audit id, or null when the signature does not match. */
export function parseAuditMdToken(raw: string): string | null {
  const m = /^([a-z0-9]+)\.([A-Za-z0-9_-]+)(?:\.md)?$/i.exec(raw.trim());
  if (!m) return null;
  const expect = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  return got.length === expect.length && timingSafeEqual(got, expect) ? m[1] : null;
}

// ── markdown rendering ────────────────────────────────────────────────────────────
// Same labels the Audit tab's export uses (rule titleKeys + the AI/PSI section strings),
// resolved from the locale dictionaries so a link renders in the operator's language.

const ISSUE_LABEL_KEYS = Object.fromEntries(AUDIT_RULES.map(rule => [rule.id, rule.titleKey]));
type Dict = typeof en;

const tr = (dict: Dict, key: string): string =>
  (Object.prototype.hasOwnProperty.call(dict, key) ? (dict as Record<string, string>)[key] : "")
  || (en as Record<string, string>)[key] || key;

/** Renders one audit's full markdown report, or null when the id matches no audit. */
export async function renderAuditMarkdown(auditId: string, lang: MdLang): Promise<string | null> {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    include: { site: { select: { url: true } } },
  }).catch(() => null);
  if (!audit) return null;

  // Same query and page shape as GET /api/audit/[id] — the share link must export exactly
  // what the in-app export exports, filters aside.
  const pages = await prisma.siteAuditPage.findMany({
    where: { auditId },
    orderBy: [{ depth: "asc" }, { url: "asc" }],
    take: 1000,
  }).catch(() => []);

  const dict = dictionaries[lang] ?? en;
  return buildAuditMarkdown(
    {
      siteUrl: audit.site.url,
      startedAt: new Date(audit.startedAt).toISOString(),
      finishedAt: audit.finishedAt ? new Date(audit.finishedAt).toISOString() : null,
      pagesCrawled: audit.pagesCrawled,
      maxPages: audit.maxPages,
      summary: audit.summary ? JSON.parse(audit.summary) : null,
    },
    pages.map(p => ({
      url: p.url, httpStatus: p.httpStatus, redirectTo: p.redirectTo, title: p.title,
      metaDescription: p.metaDescription, h1Count: p.h1Count, canonical: p.canonical,
      noindex: p.noindex, internalLinks: p.internalLinks, externalLinks: p.externalLinks,
      imagesNoAlt: p.imagesNoAlt, wordCount: p.wordCount, loadMs: p.loadMs, depth: p.depth,
      issues: p.issues ? JSON.parse(p.issues) : [],
      evidence: p.evidence ? JSON.parse(p.evidence) : null,
      brokenLinks: p.brokenLinks ? JSON.parse(p.brokenLinks) : [],
    })),
    code => tr(dict, ISSUE_LABEL_KEYS[code] ?? code),
    {
      title: tr(dict, "auditAiTitle"),
      blocked: tr(dict, "auditAiBlocked"), allowed: tr(dict, "auditAiAllowed"), unknown: tr(dict, "auditAiUnknown"),
      robotsMissing: tr(dict, "auditAiRobotsMissing"), robotsFailed: tr(dict, "auditAiFailed"),
      llmsMissing: tr(dict, "auditAiLlmsMissing"),
    },
    {
      title: tr(dict, "auditPsiTitle"), hint: tr(dict, "auditPsiHint"),
      field: tr(dict, "auditPsiField"), lab: tr(dict, "auditPsiLab"),
      score: tr(dict, "auditPsiScore"), unavailable: tr(dict, "auditPsiUnavailable"),
    },
  );
}
