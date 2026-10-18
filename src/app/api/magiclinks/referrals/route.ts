import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { magic369ClientFor } from "@/lib/magiclinks/providers";

// GET /api/magiclinks/referrals — the 369Team key owner's referral earnings (summary + the
// latest rewarded deposits), for the settings card. Read-only and free on the vendor side.
// Same guard as GET /api/magiclinks/status: figures only, the token never travels back.

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 10;

export async function GET() {
  const userId = await workspaceUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await magic369ClientFor(userId);
  if (!client) return NextResponse.json({ configured: false });
  try {
    const [summary, history] = await Promise.all([client.referrals(), client.referralHistory()]);
    return NextResponse.json({ configured: true, summary, history: history.slice(0, HISTORY_LIMIT), historyTotal: history.length });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
