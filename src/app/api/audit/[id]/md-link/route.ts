// GET /api/audit/[id]/md-link?lang=ru → { path } — the signed public .md URL for one audit.
//
// The client cannot mint the HMAC itself (the secret never leaves the server), so the Audit
// tab asks here and copies location.origin + path. Owner/team sessions only: a guest viewing
// a shared dashboard must not be able to mint new links.

import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { prisma } from "@/lib/prisma";
import { mintAuditMdToken, normalizeMdLang } from "@/lib/audit/shareMd";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await workspaceUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const audit = await prisma.siteAudit.findFirst({ where: { id, site: { userId } }, select: { id: true } });
  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lang = normalizeMdLang(new URL(req.url).searchParams.get("lang"));
  return NextResponse.json({ path: `/share/audit/${mintAuditMdToken(audit.id)}.md?lang=${lang}` });
}
