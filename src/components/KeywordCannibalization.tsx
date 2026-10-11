"use client";

// Keyword cannibalization — exact (one query, several of the site's own URLs) and related intent.
//
// Exact mode reworked (#28 follow-up): every site's groups (it was 60 groups for a whole
// portfolio, chosen after rollup rows had used up the row budget), groups keyed by site + query
// so the same query on two sites no longer opens and closes together, pagination, filters with
// counts, a site picker for large portfolios, CSV, full URLs, and no fake period — the rows are
// one 90-day total per pair, and the header says which 90 days.

import { useState, useMemo, useEffect } from "react";
import { ChevronsDownUp, ChevronsUpDown, Download, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { withShare } from "@/lib/shareParam";
import { usePersistedState } from "@/lib/usePersistedState";
import RelatedIntentCannibalization from "@/components/RelatedIntentCannibalization";
import UrlCell from "@/components/UrlCell";
import SitePicker, { SelectedSiteChips, type SiteOption } from "@/components/SitePicker";
import { Pager, WindowNote, chipBtn, downloadCsv, fileSlug, ghostBtn, idsKey, selectStyle, PAGE_SIZES, type DataWindow } from "@/components/report/ReportKit";
import { toCsv } from "@/lib/decay/logic";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface CannibalPage {
  url: string; fullUrl: string; topQuery: string;
  impressions: number; clicks: number; ctr: number; position: number;
  share: number;
}
interface CannibalGroup {
  query: string; pages: CannibalPage[]; isTrue: boolean;
  siteId: string; siteName: string;
  impressions: number; clicks: number;
}
interface SiteSummary { siteId: string; siteName: string; tags: string[]; groups: number; trueGroups: number; impressions: number }
interface CannibalResponse {
  groups?: CannibalGroup[]; total?: number; truncated?: boolean;
  window?: DataWindow | null; mixedWindows?: boolean; sites?: SiteSummary[]; error?: string;
}

type SortKey = "impressions" | "clicks" | "position";
const groupKey = (g: { siteId: string; query: string }) => `${g.siteId}\n${g.query}`;
const MIN_IMPR_CHOICES = [10, 30, 50, 100, 250, 500, 1000];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function posColor(p: number) {
  if (p <= 5)  return "#10B981";
  if (p <= 10) return "#F59E0B";
  return "#EF4444";
}

// ─── Info block ────────────────────────────────────────────────────────────────
function InfoBlock() {
  const { t } = useLanguage();
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px",
      padding: "24px 28px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("cdmHowItWorks")}</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6", margin: "0 0 12px" }}>{t("kcHowItWorks1")}</p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[t("kcHowItWorks2"), t("kcHowItWorks3"), t("kcHowItWorks4")].map((text, i) => (
            <li key={i} style={{ display: "flex", gap: "8px", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
              <span style={{ color: "#3B82F6", fontWeight: 700, flexShrink: 0 }}>•</span>{text}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("cdmWhatToDo")}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[t("kcWhatToDo1"), t("kcWhatToDo2"), t("kcWhatToDo3")].map((text, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.55" }}>
              <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{i + 1}</span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Cannibalization table ─────────────────────────────────────────────────────
function CannibalizationTable({ siteDbId, sites, onSelectSites }: {
  siteDbId: string;
  /** Portfolio only — the picker's selection, owned by the parent so Related mode shares it. */
  sites: string[] | null;
  onSelectSites?: (next: string[] | null) => void;
}) {
  const { t } = useLanguage();
  const isPortfolio = siteDbId === "all";

  const [minImpr, setMinImpr] = usePersistedState<number>("gsc_kc_min_impr", 30, v => typeof v === "number" && v >= 1);
  const [pageSize, setPageSize] = usePersistedState<number>("gsc_kc_page_size", 25, v => typeof v === "number" && PAGE_SIZES.includes(v));
  const [search,         setSearch]         = useState("");
  const [sortKey,        setSortKey]        = useState<SortKey>("impressions");
  const [filterSeverity, setFilterSeverity] = useState<"all" | "true" | "possible">("all");
  // Groups start open; this holds the ones the user closed (keyed by site + query).
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set());
  const [page,           setPage]           = useState(0);

  // ── data — loading is derived from the response key, so a refetch keeps rows on screen ──
  const sitesKey = idsKey(sites);
  const reqKey = `${siteDbId}|${minImpr}|${sitesKey}`;
  const [resp, setResp] = useState<{ key: string; data: CannibalResponse } | null>(null);
  useEffect(() => {
    if (!siteDbId) return;
    const ac = new AbortController();
    fetch(withShare("/api/gsc/cannibalization"), {
      method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: siteDbId, minImpressions: minImpr, ...(sitesKey ? { sites: sitesKey.split(",") } : {}) }),
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        setResp({ key: reqKey, data: r.ok ? j : { error: j.error ?? `HTTP ${r.status}` } });
      })
      .catch(e => { if (!ac.signal.aborted) setResp({ key: reqKey, data: { error: String(e?.message ?? e) } }); });
    return () => ac.abort();
  }, [reqKey, siteDbId, minImpr, sitesKey]);
  const loading = resp?.key !== reqKey;
  const data = resp?.data;
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const [siteList, setSiteList] = useState<SiteSummary[]>([]);
  if (data?.sites && data.sites !== siteList) setSiteList(data.sites);
  const multiSite = useMemo(() => new Set(groups.map(g => g.siteId)).size > 1, [groups]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.query.toLowerCase().includes(q) || g.pages.some(p => p.fullUrl.toLowerCase().includes(q)));
  }, [groups, search]);

  const counts = useMemo(() => ({
    all: searched.length,
    true: searched.filter(g => g.isTrue).length,
    possible: searched.filter(g => !g.isTrue).length,
  }), [searched]);

  const filtered = useMemo(() => {
    return searched
      .filter(g => filterSeverity === "all" || (filterSeverity === "true") === g.isTrue)
      .map(g => {
        const pages = [...g.pages].sort((a, b) => sortKey === "position" ? a.position - b.position : b[sortKey] - a[sortKey]);
        const groupSortValue = sortKey === "position" ? Math.min(...pages.map(p => p.position)) : sortKey === "clicks" ? g.clicks : g.impressions;
        return { ...g, pages, groupSortValue };
      })
      .sort((a, b) => sortKey === "position" ? a.groupSortValue - b.groupSortValue : b.groupSortValue - a.groupSortValue);
  }, [searched, sortKey, filterSeverity]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pagesOnScreen = visible.reduce((n, g) => n + g.pages.length, 0);

  const toggle = (k: string) =>
    setCollapsed(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOpen = visible.every(g => !collapsed.has(groupKey(g)));
  const toggleAll = () => setCollapsed(prev => {
    const n = new Set(prev);
    for (const g of visible) { if (allOpen) n.add(groupKey(g)); else n.delete(groupKey(g)); }
    return n;
  });

  const siteOptions = useMemo<SiteOption[]>(() => siteList.map(s => ({
    siteId: s.siteId, siteName: s.siteName, tags: s.tags,
    active: s.groups > 0,
    weight: s.impressions,
    figure: s.groups > 0 ? s.groups.toLocaleString() : "0",
    figureColor: "var(--color-text-primary)",
    badges: [
      { n: s.trueGroups, color: "#EF4444", title: t("kcFilterTrue").replace("🔴 ", "") },
      { n: s.groups - s.trueGroups, color: "#F59E0B", title: t("kcFilterPossible").replace("🟡 ", "") },
    ],
  })), [siteList, t]);

  function exportCsv() {
    const headers = ["Query", ...(multiSite ? ["Site"] : []), "Verdict", "URL", "Dominant", "Share %", "Impressions", "Clicks", "CTR %", "Position", "Page's top query"];
    const body: (string | number)[][] = [];
    for (const g of filtered) {
      const winner = g.pages.reduce((best, x) => x.impressions > best.impressions ? x : best, g.pages[0]);
      g.pages.forEach(p => body.push([
        g.query, ...(multiSite ? [g.siteName] : []), g.isTrue ? "true" : "possible",
        p.fullUrl, p === winner ? "yes" : "", p.share, p.impressions, p.clicks, p.ctr, p.position, p.topQuery,
      ]));
    }
    const name = !multiSite ? (groups[0]?.siteName ?? "site") : "portfolio";
    downloadCsv(`cannibalization-${fileSlug(name)}-${data?.window?.end ?? new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  const sortBtn = (k: SortKey, label: string) => (
    <button key={k} type="button" onClick={() => { setSortKey(k); setPage(0); }} style={{ ...chipBtn(sortKey === k), borderRadius: 6, padding: "4px 10px" }}>{label}</button>
  );
  const COLS = "minmax(260px,1fr) 200px 90px 80px 70px 80px";
  const label = { all: t("kcFilterAll"), true: t("kcFilterTrue"), possible: t("kcFilterPossible") };

  return (
    <div style={{ padding: "20px 28px" }}>
      {/* Window + site picker */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <WindowNote window={data?.window} mixed={data?.mixedWindows} />
          {data?.truncated && (
            <div style={{ fontSize: 12, color: "var(--color-warning)" }}>
              {t("kcTruncated").replace("{n}", groups.length.toLocaleString()).replace("{total}", (data.total ?? 0).toLocaleString())}
            </div>
          )}
        </div>
        {isPortfolio && onSelectSites && siteOptions.length > 0 && (
          <SitePicker sites={siteOptions} selected={sites} onChange={next => { onSelectSites(next); setPage(0); }}
            labels={{ onlyActive: t("kcSitesOnlyActive"), sortWeight: t("impressions"), none: t("kcSitesNone") }} />
        )}
      </div>
      {isPortfolio && onSelectSites && <SelectedSiteChips sites={siteList} selected={sites} onChange={next => { onSelectSites(next); setPage(0); }} />}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
        <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder={t("kcSearch")}
            style={{ width: "100%", padding: "7px 12px 7px 30px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
        </label>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {(["all", "true", "possible"] as const).map(v => (
            <button key={v} type="button" onClick={() => { setFilterSeverity(v); setPage(0); }}
              style={chipBtn(filterSeverity === v, v === "true" ? "#EF4444" : v === "possible" ? "#F59E0B" : "#3B82F6")}>
              {label[v]} <span style={{ opacity: 0.75 }}>{counts[v].toLocaleString()}</span>
            </button>
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }} title={t("kcMinImprHint")}>
          {t("kcMinImpr")}
          <select value={minImpr} onChange={e => { setMinImpr(Number(e.target.value)); setPage(0); }} style={selectStyle}>
            {[...new Set([...MIN_IMPR_CHOICES, minImpr])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("kcSortBy")}</span>
          {sortBtn("impressions", t("impressions"))}
          {sortBtn("clicks", t("clicks"))}
          {sortBtn("position", t("position"))}
        </div>
        <button type="button" onClick={toggleAll} disabled={!visible.length} style={{ ...ghostBtn, opacity: visible.length ? 1 : 0.5 }}>
          {allOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />} {allOpen ? t("kcCollapseAll") : t("kcExpandAll")}
        </button>
        <button type="button" onClick={exportCsv} disabled={!filtered.length} style={{ ...ghostBtn, opacity: filtered.length ? 1 : 0.5 }} title={t("exportCsv")}>
          <Download size={13} /> CSV
        </button>
        {loading && <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite", color: "var(--color-text-secondary)" }} />}
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {data?.error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: "12px", color: "#f87171", marginBottom: "12px" }}>
          {data.error}
        </div>
      )}

      <div style={{ overflowX: "auto", opacity: loading && groups.length ? 0.6 : 1, transition: "opacity 0.15s" }}>
        <div style={{ minWidth: 860 }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: COLS, gap: 8,
            padding: "8px 14px", background: "var(--color-bg)",
            borderRadius: "8px 8px 0 0", border: "1px solid var(--color-border)", borderBottom: "none",
            fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <div>{t("kcColQueryPage")}</div>
            <div>{t("kcColTopQuery")}</div>
            <div style={{ textAlign: "right" }}>{t("impressions")}</div>
            <div style={{ textAlign: "right" }}>{t("clicks")}</div>
            <div style={{ textAlign: "right" }}>{t("kcColCtr")}</div>
            <div style={{ textAlign: "right" }}>{t("position")}</div>
          </div>

          <div className="privacy-blur-all" style={{ border: "1px solid var(--color-border)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {loading && !groups.length ? (
              <div style={{ padding: "48px 32px", textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
                <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> {t("loading")}
              </div>
            ) : !visible.length ? (
              <div style={{ padding: "60px 32px", textAlign: "center", background: "var(--color-card)" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{groups.length ? t("cdmNoMatches") : t("kcEmptyTitle")}</p>
                {!groups.length && <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>{t("kcEmptyDesc")}</p>}
              </div>
            ) : visible.map((group, gi) => {
              const k = groupKey(group);
              const isOpen = !collapsed.has(k);
              return (
                <div key={k} style={{ borderBottom: gi < visible.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  {/* Query header row */}
                  <div role="button" tabIndex={0} onClick={() => toggle(k)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}
                    style={{
                      display: "grid", gridTemplateColumns: COLS, gap: 8,
                      padding: "12px 14px", cursor: "pointer",
                      background: isOpen ? "rgba(59,130,246,0.04)" : "var(--color-card)",
                      alignItems: "center", fontVariantNumeric: "tabular-nums",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, background: group.isTrue ? "#EF4444" : "#F59E0B" }} />
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={group.query}>{group.query}</span>
                      {multiSite && (
                        <button type="button" onClick={e => { e.stopPropagation(); onSelectSites?.([group.siteId]); setPage(0); }} disabled={!onSelectSites}
                          title={onSelectSites ? t("cdmSitesFilterHint") : group.siteName}
                          style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px", flexShrink: 0, border: "none", cursor: onSelectSites ? "pointer" : "default" }}>
                          {group.siteName}
                        </button>
                      )}
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", flexShrink: 0,
                        background: group.isTrue ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                        color: group.isTrue ? "#EF4444" : "#F59E0B",
                        border: `1px solid ${group.isTrue ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
                      }}>
                        {group.isTrue ? t("kcFilterTrue").replace("🔴 ", "") : t("kcFilterPossible").replace("🟡 ", "")}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                        {group.pages.length} {t("kcCompetingPages")}
                      </span>
                    </div>
                    <div />
                    <div style={{ textAlign: "right", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{group.impressions.toLocaleString()}</div>
                    <div style={{ textAlign: "right", fontSize: "13px", color: "var(--color-text-secondary)" }}>{group.clicks.toLocaleString()}</div>
                    <div /><div />
                  </div>

                  {/* Page rows — the first by impressions is the one Google prefers today. */}
                  {isOpen && group.pages.map(p => {
                    const isWinner = p === group.pages.reduce((best, x) => x.impressions > best.impressions ? x : best, group.pages[0]);
                    return (
                      <div key={p.fullUrl} style={{
                        display: "grid", gridTemplateColumns: COLS, gap: 8,
                        padding: "9px 14px 9px 38px",
                        background: isWinner ? "rgba(16,185,129,0.03)" : "rgba(239,68,68,0.02)",
                        borderTop: "1px solid var(--color-border)", alignItems: "center", fontSize: "13px", fontVariantNumeric: "tabular-nums",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: isWinner ? "#10B981" : "#EF4444" }} />
                          <span style={{ minWidth: 0, display: "flex", flex: "0 1 auto" }}><UrlCell label={p.url} href={p.fullUrl} /></span>
                          {isWinner && (
                            <span title={t("kcDominantHint")} style={{ fontSize: "10px", fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "1px 6px", borderRadius: "10px", flexShrink: 0 }}>
                              {t("kcDominant")}
                            </span>
                          )}
                          <div title={t("kcShareHint")} style={{ flex: "0 0 60px", height: "4px", background: "var(--color-border)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${p.share}%`, background: isWinner ? "#10B981" : "#EF4444", borderRadius: "2px" }} />
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flexShrink: 0 }}>{p.share}%</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.topQuery}>
                          {p.topQuery}
                          {p.topQuery !== group.query && p.topQuery.toLowerCase().includes(group.query.split(" ")[0].toLowerCase()) && (
                            <span title={t("kcTopQueryOverlapHint")} style={{ marginLeft: "5px", fontSize: "10px", color: "#EF4444", fontWeight: 700 }}>⚠</span>
                          )}
                        </div>
                        <div style={{ textAlign: "right", fontWeight: 600 }}>{p.impressions.toLocaleString()}</div>
                        <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{p.clicks.toLocaleString()}</div>
                        <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{p.ctr}%</div>
                        <div style={{ textAlign: "right", fontWeight: 600, color: posColor(p.position) }}>{p.position.toFixed(1)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <Pager page={safePage} pageCount={pageCount} pageSize={pageSize} total={filtered.length} shown={visible.length}
              onPage={setPage} onPageSize={n => { setPageSize(n); setPage(0); }}
              unit={`${t("kcQueries")} · ${pagesOnScreen.toLocaleString()} ${t("kcCompetingPages")}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
// `initialDays` / `onDaysChange` are still accepted from the pages that pass them (a shared link
// may carry ?days=), but there is no period to choose: the rows are one 90-day total per pair.
export default function KeywordCannibalization({ siteDbId }: { siteDbId: string; initialDays?: number; onDaysChange?: (days: number) => void }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"exact" | "related">("exact");
  const isPortfolio = siteDbId === "all";
  // One site selection for both modes, so switching tabs keeps the same sites in view.
  const [sites, setSites] = useState<string[] | null>(null);
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden", marginTop: "20px", background: "var(--color-card)" }}>
      <div style={{ display: "flex", gap: "4px", padding: "10px 14px 0", borderBottom: "1px solid var(--color-border)", overflowX: "auto" }}>
        {(["exact", "related"] as const).map(value => <button key={value} type="button" onClick={() => setMode(value)} style={{ padding: "8px 13px", border: "none", borderBottom: mode === value ? "2px solid #3B82F6" : "2px solid transparent", background: "transparent", color: mode === value ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontSize: "12px", fontWeight: mode === value ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>{t(value === "exact" ? "kcModeExact" : "kcModeRelated")}</button>)}
      </div>
      {mode === "exact"
        ? <><InfoBlock /><CannibalizationTable siteDbId={siteDbId} sites={isPortfolio ? sites : null} onSelectSites={isPortfolio ? setSites : undefined} /></>
        : <RelatedIntentCannibalization siteDbId={siteDbId} sites={isPortfolio ? sites : null} />}
    </div>
  );
}
