"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { withShare } from "@/lib/shareParam";
import { WindowNote, fmtDay, idsKey, type DataWindow } from "@/components/report/ReportKit";
import UrlCell from "@/components/UrlCell";
import SitePicker, { SelectedSiteChips, type SiteOption } from "@/components/SitePicker";
import type { IntentKind, IntentRecommendation, PageRole, RelatedIntentGroup } from "@/lib/cannibalization/relatedIntent";

const intentKey: Record<IntentKind, string> = {
  informational: "kcIntentInformational",
  commercial: "kcIntentCommercial",
  transactional: "kcIntentTransactional",
  local: "kcIntentLocal",
  mixed: "kcIntentMixed",
};
const roleKey: Record<PageRole, string> = {
  homepage: "kcIntentRoleHomepage",
  product: "kcIntentRoleProduct",
  category: "kcIntentRoleCategory",
  guide: "kcIntentRoleGuide",
  landing: "kcIntentRoleLanding",
  other: "kcIntentRoleOther",
};
const recommendationKey: Record<IntentRecommendation, string> = {
  merge_review: "kcIntentActionMerge",
  differentiate: "kcIntentActionDifferentiate",
  canonical_review: "kcIntentActionCanonical",
  internal_linking: "kcIntentActionInternalLinks",
};

function confidenceColor(level: RelatedIntentGroup["confidenceLevel"]) {
  return level === "high" ? "#ef4444" : level === "medium" ? "#f59e0b" : "#60a5fa";
}

interface RelatedSiteSummary { siteId: string; siteName: string; tags: string[]; groups: number; highGroups: number; impressions: number }

// `sites` is the portfolio picker's selection, shared with the exact tab (null = every site).
// There is no period selector: volumes are one 90-day total per pair (WindowNote says which), and
// "winner changes" come from the per-day rows of the last 28 days (dailyWindow says which).
export default function RelatedIntentCannibalization({ siteDbId, sites = null, onSelectSites }: {
  siteDbId: string; sites?: string[] | null; onSelectSites?: (next: string[] | null) => void;
}) {
  const { t, language } = useLanguage() as any;
  const [groups, setGroups] = useState<RelatedIntentGroup[]>([]);
  const sitesKey = idsKey(sites);
  const [dataWindow, setDataWindow] = useState<{ window: DataWindow | null; mixed: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [confidence, setConfidence] = useState<"all" | "high" | "medium">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [dailyWindow, setDailyWindow] = useState<DataWindow | null>(null);
  const [siteList, setSiteList] = useState<RelatedSiteSummary[]>([]);
  const isPortfolio = siteDbId === "all";

  const load = useCallback(async () => {
    if (!siteDbId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(withShare("/api/gsc/cannibalization"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, mode: "related", minImpressions: 30, limit: 200, ...(sitesKey ? { sites: sitesKey.split(",") } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "related_intent_failed");
      const next = result.groups ?? [];
      setGroups(next);
      setExpanded(new Set(next.slice(0, 12).map((group: RelatedIntentGroup) => group.id)));
      setTruncated(result.truncated === true);
      setDataWindow({ window: result.window ?? null, mixed: result.mixedWindows === true });
      setDailyWindow(result.dailyWindow ?? null);
      setTotal(Number(result.total) || next.length);
      if (Array.isArray(result.sites)) setSiteList(result.sites);
    } catch { setError(t("kcIntentError")); }
    setLoading(false);
  }, [sitesKey, siteDbId, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => groups.filter(group => {
    const haystack = `${group.queries.join(" ")} ${group.pages.map(page => page.fullUrl).join(" ")}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (confidence === "high" && group.confidenceLevel !== "high") return false;
    if (confidence === "medium" && group.confidenceLevel === "low") return false;
    return true;
  }), [confidence, groups, search]);

  const siteOptions = useMemo<SiteOption[]>(() => siteList.map(s => ({
    siteId: s.siteId, siteName: s.siteName, tags: s.tags,
    active: s.groups > 0,
    weight: s.impressions,
    figure: s.groups.toLocaleString(),
    badges: [
      { n: s.highGroups, color: "#ef4444", title: t("kcIntentConfidenceHigh") },
      { n: s.groups - s.highGroups, color: "#f59e0b", title: t("kcIntentClusters") },
    ],
  })), [siteList, t]);

  const toggle = (id: string) => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--color-border)", background: "var(--color-card)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <ShieldCheck size={18} color="#60a5fa" style={{ marginTop: "2px", flexShrink: 0 }} />
          <div>
            <div style={{ color: "var(--color-text-primary)", fontWeight: 700, fontSize: "14px" }}>{t("kcIntentTitle")}</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: "12px", lineHeight: 1.55, marginTop: "3px" }}>{t("kcIntentDescription")}</div>
          </div>
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{t("kcIntentNoAuto")}</div>
      </div>

      <div style={{ padding: "18px 28px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <input className="tool-input" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("kcIntentSearch")} style={{ flex: "1 1 220px", minWidth: "180px" }} />
          <select className="tool-input" value={confidence} onChange={event => setConfidence(event.target.value as typeof confidence)} style={{ width: "auto" }}>
            <option value="all">{t("kcIntentConfidenceAll")}</option>
            <option value="high">{t("kcIntentConfidenceHigh")}</option>
            <option value="medium">{t("kcIntentConfidenceMediumPlus")}</option>
          </select>
          {loading && <Loader2 className="spin" size={16} color="#60a5fa" />}
        </div>

        {error && <div style={{ display: "flex", gap: "7px", alignItems: "center", color: "#f87171", fontSize: "12px" }}><AlertTriangle size={13} /> {error}</div>}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <WindowNote window={dataWindow?.window} mixed={dataWindow?.mixed} />
            {/* Winner changes need per-day rows; say where they come from, or that they don't yet. */}
            {!loading && (
              <div style={{ fontSize: 12, color: dailyWindow ? "var(--color-text-secondary)" : "var(--color-warning)" }}>
                {dailyWindow
                  ? t("kcIntentDailyWindow").replace("{days}", String(dailyWindow.days)).replace("{range}", `${fmtDay(dailyWindow.start)} – ${fmtDay(dailyWindow.end)}`)
                  : t("kcIntentDailyMissing")}
              </div>
            )}
            {total > groups.length && (
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                {t("kcIntentShowingTop").replace("{n}", groups.length.toLocaleString()).replace("{total}", total.toLocaleString())}
              </div>
            )}
          </div>
          {isPortfolio && onSelectSites && siteOptions.length > 0 && (
            <SitePicker sites={siteOptions} selected={sites} onChange={onSelectSites}
              labels={{ onlyActive: t("kcSitesOnlyActive"), sortWeight: t("impressions"), none: t("kcSitesNone") }} />
          )}
        </div>
        {isPortfolio && onSelectSites && <SelectedSiteChips sites={siteList} selected={sites} onChange={onSelectSites} />}
        {truncated && <div style={{ color: "#f59e0b", fontSize: "11px" }}>{t("kcIntentTruncated")}</div>}

        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "8px" }}>
            {([
              [filtered.length, "kcIntentClusters", "#60a5fa"],
              [filtered.reduce((sum, group) => sum + group.pages.length, 0), "kcCompetingPages", "#f59e0b"],
              [filtered.reduce((sum, group) => sum + group.totalImpressions, 0).toLocaleString(language), "impressions", "#a78bfa"],
              [filtered.filter(group => group.confidenceLevel === "high").length, "kcIntentHighConfidence", "#ef4444"],
            ] as [string | number, string, string][]).map(([value, key, color]) => (
              <div key={String(key)} className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                <div style={{ color, fontSize: "20px", fontWeight: 800 }}>{value}</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: "10px" }}>{t(String(key))}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !filtered.length ? (
          <div className="panel" style={{ padding: "36px", textAlign: "center" }}>
            <div style={{ color: "var(--color-text-primary)", fontSize: "14px", fontWeight: 700 }}>{t("kcIntentEmptyTitle")}</div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: "12px", marginTop: "5px" }}>{t("kcIntentEmptyDesc")}</div>
          </div>
        ) : (
          <div className="privacy-blur-all" style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {filtered.map(group => {
              const open = expanded.has(group.id);
              const color = confidenceColor(group.confidenceLevel);
              return (
                <div key={group.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
                  <button onClick={() => toggle(group.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "transparent", border: "none", color: "inherit", cursor: "pointer", textAlign: "left", flexWrap: "wrap" }}>
                    <ChevronRight size={15} color="var(--color-text-secondary)" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                    <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.primaryQuery}</div>
                      <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", marginTop: "3px" }}>{group.siteName} · {group.queries.length} {t("kcQueries")} · {t(intentKey[group.intent])}</div>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, color, background: `${color}18`, border: `1px solid ${color}55`, borderRadius: "20px", padding: "3px 8px" }}>{group.confidence}% · {t(`kcIntentConfidence${group.confidenceLevel[0].toUpperCase()}${group.confidenceLevel.slice(1)}`)}</span>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,.12)", borderRadius: "20px", padding: "3px 8px" }}>{t(recommendationKey[group.recommendation])}</span>
                  </button>

                  {open && <div style={{ borderTop: "1px solid var(--color-border)", padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "11px" }}>
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>{group.queries.map(query => <span key={query} style={{ color: "var(--color-text-secondary)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "6px", padding: "3px 7px", fontSize: "10px" }}>{query}</span>)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: "7px" }}>
                      {[
                        [group.evidence.querySimilarity + "%", "kcIntentQuerySimilarity"],
                        [group.evidence.rankingUrlOverlap + "%", "kcIntentUrlOverlap"],
                        [dailyWindow ? group.evidence.flipFlops : "—", "kcIntentFlipFlops"],
                        [group.evidence.positionGap.toFixed(1), "kcIntentPositionGap"],
                      ].map(([value, key]) => <div key={String(key)} style={{ background: "var(--color-bg)", borderRadius: "7px", padding: "7px 9px" }}><div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{value}</div><div style={{ fontSize: "9px", color: "var(--color-text-tertiary)" }}>{t(String(key))}</div></div>)}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "11px" }}>
                        <thead><tr style={{ color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                          <th style={{ padding: "7px 6px" }}>URL</th><th>{t("kcIntentPageRole")}</th><th>{t("kcQueries")}</th><th style={{ textAlign: "right" }}>{t("impressions")}</th><th style={{ textAlign: "right" }}>{t("clicks")}</th><th style={{ textAlign: "right" }}>{t("position")}</th><th style={{ textAlign: "right" }}>{t("kcIntentShare")}</th>
                        </tr></thead>
                        <tbody>{group.pages.map(page => <tr key={page.fullUrl} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "8px 6px", maxWidth: "280px" }}><span style={{ display: "flex", minWidth: 0 }}><UrlCell label={page.url} href={page.fullUrl} fontSize={11} color="#60a5fa" /></span></td>
                          <td style={{ color: "var(--color-text-secondary)" }}>{t(roleKey[page.role])}</td>
                          <td style={{ color: "var(--color-text-secondary)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.queries.slice(0, 3).join(" · ")}</td>
                          <td style={{ textAlign: "right" }}>{page.impressions.toLocaleString(language)}</td><td style={{ textAlign: "right" }}>{page.clicks}</td><td style={{ textAlign: "right" }}>{page.position.toFixed(1)}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{page.share}%</td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "11px", lineHeight: 1.5 }}><b style={{ color: "#a78bfa" }}>{t(recommendationKey[group.recommendation])}:</b> {t(`${recommendationKey[group.recommendation]}Desc`)}</div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
