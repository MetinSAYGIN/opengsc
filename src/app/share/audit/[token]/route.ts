// Public markdown share link: GET /share/audit/<id>.<sig>.md?lang=ru
//
// The proxy lets every /share/ path through (src/proxy.ts), and the HMAC signature IS the
// authorization — a valid token opens exactly one audit, nothing else. Served as text/markdown
// with X-Robots-Tag so search engines never index an operator's audit report.

import { normalizeMdLang, parseAuditMdToken, renderAuditMarkdown } from "@/lib/audit/shareMd";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const auditId = parseAuditMdToken(String(token ?? ""));
  if (!auditId) return new Response("Not found", { status: 404 });

  const lang = normalizeMdLang(new URL(req.url).searchParams.get("lang"));
  const md = await renderAuditMarkdown(auditId, lang);
  if (md == null) return new Response("Not found", { status: 404 });

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      // Audit contents are the operator's data — no shared-cache copies, every fetch is fresh.
      "Cache-Control": "no-store",
    },
  });
}
