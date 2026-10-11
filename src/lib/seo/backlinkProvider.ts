// Which provider filled a site's SiteBacklink rows — pure, Prisma-free (issue #29).
//
// The rows themselves carry no provider column: `source = "api"` means "some provider's export".
// The run that wrote them does know, through the pagination mode each export path records on its
// SiteBacklinkSync row:
//   • Ahrefs      — "offset" | "keyset" (or "" for a run that died before the first page)
//   • Keys.so     — "keysso_page"
//   • DataForSEO  — "dataforseo_token"
// So the latest api run names the provider. Everything that labels provider data ("Lost per …",
// the client report's source line, the DR column) reads it from here instead of saying "Ahrefs".

export type BacklinkProviderId = "ahrefs" | "dataforseo" | "keysso";

export function providerFromSyncMode(mode: string | null | undefined): BacklinkProviderId {
  const m = String(mode ?? "").toLowerCase();
  if (m.startsWith("dataforseo")) return "dataforseo";
  if (m.startsWith("keysso")) return "keysso";
  return "ahrefs";
}

/** Display name. `null` (no api run yet — CSV/manual rows only) reads as a neutral "API". */
export function providerLabel(p: BacklinkProviderId | null | undefined): string {
  switch (p) {
    case "ahrefs": return "Ahrefs";
    case "dataforseo": return "DataForSEO";
    case "keysso": return "Keys.so";
    default: return "API";
  }
}

/**
 * What the provider's per-link authority number is called, or null when the rows carry none.
 * DataForSEO export rows deliberately store no DR (its rank is not DR — see
 * dataforseoBacklinksParse.ts), so a "DR" average over them would be a column of blanks.
 */
export function providerDrLabel(p: BacklinkProviderId | null | undefined): string | null {
  switch (p) {
    case "ahrefs": return "Ahrefs DR";
    case "keysso": return "Keys.so DR";
    default: return null;
  }
}
