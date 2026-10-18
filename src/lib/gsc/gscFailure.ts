// Why a Google Search Console call failed — the difference the UI owes the user.
// Every live-GSC caller used to swallow its errors and render "no data": a dashboard over
// quota showed empty Queries/Pages tables next to correct totals (issue #38) and nothing
// anywhere said why. "quota" is transient and self-heals; "unreachable" is auth/network and
// needs a human. Pure — no imports, safe for client and server alike.

export type GscFailure = "quota" | "unreachable";

export function isGscQuotaError(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; message?: string };
  const status = Number(e?.code ?? e?.status);
  if (status === 429) return true;
  if (typeof e?.message !== "string") return false;
  // Google's quota replies carry the reason in prose: "Loading cost is too high",
  // "Quota exceeded", "rate limit"…
  return /quota|rate.?limit|too many requests|loading cost/i.test(e.message);
}

export function classifyGscFailure(err: unknown): GscFailure {
  return isGscQuotaError(err) ? "quota" : "unreachable";
}
