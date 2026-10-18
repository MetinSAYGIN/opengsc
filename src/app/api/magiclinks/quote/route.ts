import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { fieldLinkClientFor, magic369ClientFor } from "@/lib/magiclinks/providers";
import { idempotencyKeyFor } from "@/lib/magiclinks/fieldlink";
import { quoteArticles, quoteLinks } from "@/lib/magiclinks/magic369";
import { parseRequestItems } from "@/lib/magiclinks/requestItems";
import { isMagicProviderId, PROVIDER_FIELDLINK, PROVIDER_FIELDLINK_LINKS, PROVIDER_MAGIC369_LINKS, type BuyProductId } from "@/lib/magiclinks/purchases";

// POST /api/magiclinks/quote — price a selection WITHOUT paying for it.
//
// FieldLink: creates the task server-side first (task creation is free and idempotent by body
// hash), then quotes it. The taskId comes back so submit can reference the exact priced task.
// 369Team: there is no quote call in that API — the prices come from /balance and are computed
// here, which is also why submit re-checks them before charging. Articles are priced by the
// volume tier the WHOLE order's paid count falls into (price_tiers); homepage links at the flat
// link_price. The bonus (+50% / +20% per row) is an estimate — the spec gives no rounding.

export const dynamic = "force-dynamic";

/** What the buy modal shows and what submit echoes back as the expected amount. */
export interface QuoteResponse {
  provider: BuyProductId;
  taskId?: string;
  placementCount: number;
  /** Estimated for 369Team (rate × count per row, rounded down); exact for FieldLink. */
  bonusCount: number;
  /** Price of one paid placement this order gets (369Team: the applicable tier). */
  unitMinor?: number;
  amountMinor: number;
  balanceMinor: number | null;
  shortfallMinor: number;
  canSubmit: boolean;
  /** FieldLink: the new order includes auto-indexing and then CANNOT be cancelled. */
  indexingIncluded?: boolean;
}

const MAX_ITEMS = 50;

export async function POST(req: Request) {
  const userId = await workspaceUserId("write");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const flLinks = b?.provider === PROVIDER_FIELDLINK_LINKS;
  const provider = flLinks ? PROVIDER_FIELDLINK : isMagicProviderId(b?.provider) ? b.provider : PROVIDER_FIELDLINK;
  const rawItems = Array.isArray(b?.items) ? b.items : [];
  if (rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: "bad_items", message: `1-${MAX_ITEMS} rows expected` }, { status: 400 });
  }
  const items = parseRequestItems(rawItems, { links: provider === PROVIDER_MAGIC369_LINKS, flLinks });
  if (typeof items === "string") return NextResponse.json({ error: "bad_brief", message: items }, { status: 400 });

  try {
    if (provider === PROVIDER_FIELDLINK) {
      const client = await fieldLinkClientFor(userId);
      if (!client) return NextResponse.json({ error: "not_configured", message: "FieldLink token is not set" }, { status: 400 });

      // The idempotency key hashes the exact body, so re-quoting the same selection the same
      // day returns the same saved task instead of forking a new one. `topic` is a MODE since
      // contract 1.19 ("auto" | "casino" | "other") — the task label goes in `name`.
      const name = `OpenGSC striking ${new Date().toISOString().slice(0, 10)}`;
      let created: { taskId?: string; task?: { id: string } };
      if (flLinks) {
        const briefs = items.map(it => ({
          targetUrl: it.targetUrl, anchor: it.anchor, language: it.language, count: it.count, tier: it.tier,
          ...(it.contentHint ? { contentHint: it.contentHint } : {}),
        }));
        const payload = { name: `${name} · links`, items: briefs };
        created = await client.createLinks(payload, idempotencyKeyFor(payload));
      } else {
        const briefs = items.map(it => ({ targetUrl: it.targetUrl, anchor: it.anchor, titleKeyword: it.titleKeyword, language: it.language, count: it.count }));
        const payload = { name, topic: "auto" as const, items: briefs };
        created = await client.createPosts(payload, idempotencyKeyFor(payload));
      }
      const taskId = created.taskId ?? created.task?.id;
      if (!taskId) return NextResponse.json({ error: "no_task" }, { status: 502 });
      const q = await client.quote(taskId);
      const res: QuoteResponse = {
        provider: flLinks ? PROVIDER_FIELDLINK_LINKS : provider,
        taskId,
        placementCount: q.placementCount,
        bonusCount: q.bonusCount,
        amountMinor: q.amountMinor,
        balanceMinor: q.balanceMinor,
        shortfallMinor: q.shortfallMinor,
        canSubmit: q.canSubmit,
        indexingIncluded: !!q.indexingIncluded,
      };
      return NextResponse.json(res);
    }

    const client = await magic369ClientFor(userId);
    if (!client) return NextResponse.json({ error: "not_configured", message: "369 Links Market token is not set" }, { status: 400 });

    const balance = await client.balance();
    const counts = items.map(it => it.count ?? 1);
    const q = provider === PROVIDER_MAGIC369_LINKS ? quoteLinks(balance, counts) : quoteArticles(balance, counts);
    if (!q) {
      return NextResponse.json({ error: "no_link_price", message: "369 Links Market did not report link_price in /balance" }, { status: 502 });
    }
    const res: QuoteResponse = {
      provider,
      placementCount: q.paid,
      bonusCount: q.bonus,
      unitMinor: q.priceMinor,
      amountMinor: q.amountMinor,
      balanceMinor: balance.balanceMinor,
      shortfallMinor: Math.max(0, q.amountMinor - balance.balanceMinor),
      canSubmit: balance.balanceMinor >= q.amountMinor,
    };
    return NextResponse.json(res);
  } catch (e) {
    console.error("[MagicLinks] quote failed", e);
    return NextResponse.json(
      { error: "quote_failed", message: String((e as Error)?.message ?? e), code: (e as { code?: string })?.code },
      { status: ((e as { status?: number }).status ?? 0) >= 400 && ((e as { status?: number }).status ?? 0) < 500 ? (e as { status?: number }).status : 502 },
    );
  }
}
