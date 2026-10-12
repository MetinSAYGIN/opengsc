"use client";

// Striking distance — queries ranking just off the top, per page, for one site or a portfolio.
//
// Reworked (#28 follow-up): every in-band pair of every site (it was 200 rows across the whole
// portfolio, with rollup rows eating the budget), real pagination, a site picker for large
// portfolios, CSV, full URLs, a free "est. +clicks" estimate to sort thousands of rows by before
// paying for volumes, and no fake period — the rows are one 90-day total per pair, and the
// header says which 90 days.

import { useState, useMemo, useEffect, useCallback } from "react";
import { Download, ShoppingCart, Loader2, Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { withShare, isGuestView } from "@/lib/shareParam";
import { usePersistedState } from "@/lib/usePersistedState";
import KeywordWeightsBar from "@/components/KeywordWeightsBar";
import BuyLinksModal, { type BuyRow } from "@/components/magiclinks/BuyLinksModal";
import { useKeywordWeights, type KeywordWeight, type UseKeywordWeights } from "@/lib/seo/useKeywordWeights";
import UrlCell from "@/components/UrlCell";
import SitePicker, { SelectedSiteChips, type SiteOption } from "@/components/SitePicker";
import { Pager, WindowNote, chipBtn, downloadCsv, fileSlug, ghostBtn, idsKey, selectStyle, PAGE_SIZES, type DataWindow } from "@/components/report/ReportKit";
import { toCsv } from "@/lib/decay/logic";
import { proximity, TARGET_POSITION, type Proximity } from "@/lib/striking/logic";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface StrikingKeyword {
  query: string; page: string; fullUrl: string;
  impressions: number; clicks: number; ctr: number; position: number;
  gain: number;
  siteId: string; siteName: string;
}
interface SiteSummary { siteId: string; siteName: string; tags: string[]; keywords: number; impressions: number; gain: number }
interface StrikingResponse {
  keywords?: StrikingKeyword[]; total?: number; truncated?: boolean;
  window?: DataWindow | null; mixedWindows?: boolean; sites?: SiteSummary[]; error?: string;
}

type SortKey = "gain" | "impressions" | "clicks" | "position" | "ctr" | "potential";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

/**
 * Rough organic CTR at the top of page one. Used to turn search volume into "clicks this
 * keyword could produce", which is the number that makes a striking-distance list sortable by
 * something other than impressions.
 *
 * Impressions are demand filtered through your current visibility — a keyword sitting at
 * position 18 shows a small number no matter how big its market is. Volume is the market
 * itself, and the gap between the two is exactly what this view is for.
 *
 * The constant is approximate and deliberately conservative. It is used only for ordering and
 * relative comparison, never presented as a forecast.
 */
const CTR_AT_TOP = 0.1;

/**
 * Cache lookups must normalize exactly the way the server does (`normalizeKeyword`), or a GSC
 * query with stray whitespace silently misses a weight that was fetched and paid for — showing
 * an em dash next to a keyword whose volume is sitting in the database.
 */
const wKey = (q: string) => q.trim().toLowerCase();

/**
 * Keyword volumes are a paid lookup. The list used to be capped at 200 rows, so "load volumes"
 * could never cost more than 200 keywords; now that every pair is listed, the paid scope is the
 * top of the current filtered list instead of all of it.
 */
const WEIGHT_CAP = 300;

/** Clicks left on the table: what the keyword could bring near the top, minus what it brings now. */
function potentialOf(k: StrikingKeyword, w?: KeywordWeight): number | null {
  if (!w || w.volume == null) return null;
  return Math.max(0, Math.round(w.volume * CTR_AT_TOP) - k.clicks);
}

function kdColor(kd: number) {
  if (kd <= 14) return "var(--color-success)";
  if (kd <= 29) return "var(--color-accent-green)";
  if (kd <= 49) return "var(--color-warning)";
  if (kd <= 69) return "var(--color-accent-orange)";
  return "var(--color-danger)";
}

function posColor(p: number) {
  if (p <= 5)  return "#10B981";
  if (p <= 10) return "#F59E0B";
  if (p <= 15) return "#F97316";
  return "#EF4444";
}

const PROX = {
  top5:      { key: "sdkProxTop5",      color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  page1:     { key: "sdkProxPage1",     color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  nearPage2: { key: "sdkProxNearPage2", color: "#F97316", bg: "rgba(249,115,22,0.1)" },
  page2plus: { key: "sdkProxPage2Plus", color: "#EF4444", bg: "rgba(239,68,68,0.1)" },
} as const satisfies Record<Proximity, { key: string; color: string; bg: string }>;

const MIN_IMPR_CHOICES = [1, 10, 30, 50, 100, 500, 1000];

// ─── Info block ────────────────────────────────────────────────────────────────
function InfoBlock({ posFrom, setPosFrom, posTo, setPosTo, minImpr, setMinImpr }: {
  posFrom: number; setPosFrom: (v: number) => void;
  posTo: number;   setPosTo:   (v: number) => void;
  minImpr: number; setMinImpr: (v: number) => void;
}) {
  const { t } = useLanguage();
  const numInput: React.CSSProperties = { width: "70px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "14px", fontWeight: 600, outline: "none", textAlign: "center" };
  return (
    <div className="report-info-grid" style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "32px",
      padding: "24px 28px", borderBottom: "1px solid var(--color-border)", background: "var(--color-card)",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="20" x2="12" y2="10"/><line x1="12" y1="6" x2="12" y2="6"/>
              <polyline points="8 14 12 10 16 14"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("sdkPosRange")}</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6", margin: "0 0 16px" }}>
          {t("sdkPosRangeDesc")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("sdkFrom")}</span>
          <input type="number" value={posFrom} min={1} max={100}
            onChange={e => setPosFrom(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={numInput} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("sdkTo")}</span>
          <input type="number" value={posTo} min={1} max={100}
            onChange={e => setPosTo(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={numInput} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 600 }} title={t("sdkMinImprHint")}>
            {t("sdkMinImpr")}
            <select value={minImpr} onChange={e => setMinImpr(Number(e.target.value))} style={selectStyle}>
              {[...new Set([...MIN_IMPR_CHOICES, minImpr])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("cdmWhatToDo")}</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[t("sdkWhatToDo1"), t("sdkWhatToDo2")].map((text, i) => (
            <li key={i} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.55" }}>
              <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{i + 1}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// The leading checkbox and the trailing buy button belong to the link purchase flow — both
// hidden for guests on share links, like the Track buttons.
const GRID = "34px minmax(160px,1.3fr) minmax(160px,1fr) 92px 74px 62px 58px 66px 76px 72px 50px 76px 44px";

// ─── Table ─────────────────────────────────────────────────────────────────────
function KeywordsTable({
  rows, loading, siteDbId, weights, country, sortKey, setSortKey, search, setSearch,
  multiSite, onSelectSite, onExport, header,
}: {
  rows: StrikingKeyword[]; loading: boolean; siteDbId: string;
  weights: UseKeywordWeights; country: string;
  sortKey: SortKey; setSortKey: (k: SortKey) => void;
  search: string; setSearch: (s: string) => void;
  multiSite: boolean; onSelectSite?: (siteId: string) => void;
  onExport: () => void;
  header?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const guest = isGuestView();
  const [pageSize, setPageSize] = usePersistedState<number>("gsc_striking_page_size", 25, v => typeof v === "number" && PAGE_SIZES.includes(v));
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Rank tracker integration: one-click "Track" per keyword
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!siteDbId || guest) return;
    fetch(`/api/rank/keywords?siteId=${encodeURIComponent(siteDbId)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.keywords)) setTracked(new Set(d.keywords.map((k: { keyword: string }) => String(k.keyword).toLowerCase()))); })
      .catch(() => {});
  }, [siteDbId, guest]);

  const track = (query: string, siteIdOverride?: string) => {
    if (guest) return;
    const targetSiteId = siteIdOverride || siteDbId;
    const kw = query.trim().toLowerCase();
    if (!kw || tracked.has(kw) || !targetSiteId || targetSiteId === "all") return;
    setTracked(prev => new Set(prev).add(kw));
    fetch("/api/rank/keywords", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: targetSiteId, keywords: [kw] }),
    })
      .then(() => fetch("/api/rank/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: targetSiteId }),
      }))
      .catch(() => {});
  };

  // ── Link purchases ──────────────────────────────────────────────────────────
  // The pair key is query + full URL: exactly the unit a purchase covers, so the badge means
  // "this pair has money on it", not "this keyword was bought for some other page".
  const rowKey = (k: StrikingKeyword) => `${k.query}\n${k.fullUrl}`;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [buyRows, setBuyRows] = useState<BuyRow[] | null>(null);
  const [bought, setBought] = useState<Map<string, { quantity: number; lastAt: string }>>(new Map());

  const loadPurchases = useCallback(() => {
    if (!siteDbId || guest) return;
    fetch(`/api/magiclinks/purchases?siteId=${encodeURIComponent(siteDbId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const map = new Map<string, { quantity: number; lastAt: string }>();
        for (const s of Array.isArray(d?.summaries) ? d.summaries : []) {
          map.set(`${String(s.query)}\n${String(s.targetUrl)}`, { quantity: Number(s.quantity) || 0, lastAt: String(s.lastAt ?? "") });
        }
        setBought(map);
      })
      .catch(() => {});
  }, [siteDbId, guest]);
  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  const toggleRowSel = (k: StrikingKeyword) => {
    const key = rowKey(k);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // The header checkbox covers the page on screen: with thousands of rows, "everything" would
  // put an order for thousands of pairs one click away.
  const allVisibleSelected = visible.length > 0 && visible.every(k => selected.has(rowKey(k)));
  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of visible) { if (allVisibleSelected) next.delete(rowKey(k)); else next.add(rowKey(k)); }
      return next;
    });
  };

  const selectedRows = useMemo(() => rows.filter(k => selected.has(rowKey(k))), [rows, selected]);

  const openBuy = (list: StrikingKeyword[]) => {
    setBuyRows(list.map(k => ({ query: k.query, targetUrl: k.fullUrl, siteId: k.siteId || siteDbId })));
  };

  const sortBtn = (k: SortKey, label: string, title?: string) => (
    <button key={k} type="button" onClick={() => { setSortKey(k); setPage(0); }} title={title} style={{ ...chipBtn(sortKey === k), borderRadius: 6, padding: "4px 10px" }}>{label}</button>
  );

  return (
    <div style={{ padding: "20px 28px" }}>
      {header}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <label style={{ position: "relative", flex: "1 1 220px", maxWidth: "340px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder={t("sdkSearch")}
            style={{ width: "100%", padding: "7px 12px 7px 30px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("kcSortBy")}</span>
          {sortBtn("gain", t("sdkColGain"), t("sdkGainHint").replace("{pos}", String(TARGET_POSITION)))}
          {sortBtn("impressions", t("impressions"))}
          {sortBtn("clicks", t("clicks"))}
          {sortBtn("position", t("position"))}
          {sortBtn("ctr", "CTR")}
          {sortBtn("potential", t("kwColPotential"))}
        </div>
        <div style={{ flex: 1 }} />
        {loading && <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite", color: "var(--color-text-secondary)" }} />}
        <button type="button" onClick={onExport} disabled={!rows.length} style={{ ...ghostBtn, opacity: rows.length ? 1 : 0.5 }} title={t("exportCsv")}>
          <Download size={13} /> CSV
        </button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Bulk buy bar — appears only with a selection; the label says exactly what will be
          ordered (N pairs), never a silent subset of it. */}
      {!guest && selectedRows.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "4px 6px 4px 12px", borderRadius: "20px", background: "rgba(124,58,237,0.1)", fontSize: "12px", fontWeight: 600, color: "#7C3AED" }}>
            <span>{t("mlSelected").replace("{n}", String(selectedRows.length))}</span>
            <button type="button" onClick={() => openBuy(selectedRows)}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 11px", borderRadius: "14px", border: "none", background: "#7C3AED", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              <ShoppingCart size={12} /> {t("mlBuy")}
            </button>
            <button type="button" onClick={() => setSelected(new Set())}
              style={{ border: "none", background: "transparent", color: "#7C3AED", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              {t("cdmSitesClear")}
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto", opacity: loading && rows.length ? 0.6 : 1, transition: "opacity 0.15s" }}>
        <div style={{ minWidth: 1180 }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: GRID,
            padding: "8px 14px", background: "var(--color-bg)",
            borderRadius: "8px 8px 0 0", border: "1px solid var(--color-border)", borderBottom: "none",
            fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", gap: "10px",
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {!guest && (
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} title={t("sdkSelectPage")}
                  style={{ width: "14px", height: "14px", accentColor: "#7C3AED", cursor: "pointer" }} />
              )}
            </div>
            <div>{t("sdkColQuery")}</div>
            <div>{t("cdmPage")}</div>
            <div>{t("sdkColProximity")}</div>
            <div style={{ textAlign: "right" }}>{t("impressions")}</div>
            <div style={{ textAlign: "right" }}>{t("clicks")}</div>
            <div style={{ textAlign: "right" }}>CTR</div>
            <div style={{ textAlign: "right" }}>{t("position")}</div>
            <div style={{ textAlign: "right" }} title={t("sdkGainHint").replace("{pos}", String(TARGET_POSITION))}>{t("sdkColGain")}</div>
            <div style={{ textAlign: "right" }}>{t("kwColVolume")}</div>
            <div style={{ textAlign: "right" }}>{t("kwColKd")}</div>
            <div style={{ textAlign: "right" }} title={t("kwPotentialHint")}>{t("kwColPotential")}</div>
            <div />
          </div>

          {/* Rows */}
          <div className="privacy-blur-all" style={{ border: "1px solid var(--color-border)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {loading && !rows.length ? (
              <div style={{ padding: "48px 32px", textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
                <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> {t("loading")}
              </div>
            ) : !rows.length ? (
              <div style={{ padding: "60px 32px", textAlign: "center", background: "var(--color-card)" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎯</div>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{t("sdkEmptyTitle")}</p>
                <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>{t("sdkEmptyDesc")}</p>
              </div>
            ) : visible.map((item, i) => {
              const prox = PROX[proximity(item.position)];
              const w = weights.get(item.query, country);
              const potential = potentialOf(item, w);
              const key = rowKey(item);
              const isSel = selected.has(key);
              const purchase = bought.get(key);
              return (
                <div key={`${item.siteId}\n${key}`} style={{
                  display: "grid", gridTemplateColumns: GRID,
                  padding: "10px 14px", gap: "10px",
                  borderBottom: i < visible.length - 1 ? "1px solid var(--color-border)" : "none",
                  background: isSel ? "rgba(124,58,237,0.06)" : i % 2 === 0 ? "var(--color-card)" : "rgba(255,255,255,0.02)",
                  alignItems: "center", fontSize: "13px", fontVariantNumeric: "tabular-nums",
                }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {!guest && (
                      <input type="checkbox" checked={isSel} onChange={() => toggleRowSel(item)}
                        style={{ width: "14px", height: "14px", accentColor: "#7C3AED", cursor: "pointer" }} />
                    )}
                  </div>
                  {/* Query */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", minWidth: 0 }}>
                    {!guest && (tracked.has(item.query.toLowerCase()) ? (
                      <span title={t("rankTracked")} style={{ color: "#10B981", flexShrink: 0, fontSize: "12px" }}>✓</span>
                    ) : (
                      <button type="button" onClick={() => track(item.query, item.siteId)} title={t("rankTrack")}
                        style={{ width: "17px", height: "17px", borderRadius: "4px", border: "1px solid var(--color-border)", background: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: 0, flexShrink: 0 }}>+</button>
                    ))}
                    <span style={{ fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.query}>
                      {item.query}
                    </span>
                    {/* Already-bought mark: this exact query+URL pair has paid links behind it. */}
                    {purchase && (
                      <span title={t("mlBoughtN").replace("{n}", String(purchase.quantity)) + ` · ${purchase.lastAt.slice(0, 10)}`}
                        style={{ flexShrink: 0, fontSize: "10px", fontWeight: 700, color: "#7C3AED", background: "rgba(124,58,237,0.12)", padding: "2px 6px", borderRadius: "10px", whiteSpace: "nowrap" }}>
                        ✦ {purchase.quantity} · {purchase.lastAt.slice(5, 10).split("-").reverse().join(".")}
                      </span>
                    )}
                    {multiSite && item.siteName && (
                      <button type="button" onClick={() => onSelectSite?.(item.siteId)} disabled={!onSelectSite} title={onSelectSite ? t("cdmSitesFilterHint") : item.siteName}
                        style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px", flexShrink: 0, border: "none", cursor: onSelectSite ? "pointer" : "default" }}>
                        {item.siteName}
                      </button>
                    )}
                  </div>
                  <div style={{ minWidth: 0, display: "flex" }}>
                    <UrlCell label={item.page} href={item.fullUrl} />
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", color: prox.color, background: prox.bg, whiteSpace: "nowrap" }}>
                      {t(prox.key)}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 600 }}>{fmtK(item.impressions)}</div>
                  <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{item.clicks}</div>
                  <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{item.ctr}%</div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: posColor(item.position) }}>{item.position.toFixed(1)}</div>
                  <div style={{ textAlign: "right", fontWeight: 600, color: item.gain > 0 ? "var(--color-success)" : "var(--color-text-tertiary)" }}>
                    {item.gain > 0 ? `+${fmtK(item.gain)}` : "—"}
                  </div>
                  {/* Weights. An em dash rather than a zero: no data and no demand must not look
                      the same, or the whole point of loading them is lost. */}
                  <div style={{ textAlign: "right", fontWeight: 600, color: w?.volume != null ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}
                    title={w ? `${w.cpc != null ? `CPC ${w.cpc}` : ""}${w.cpc != null ? " · " : ""}${w.source === "csv" ? t("kwSourceCsv") : t("kwSourceApi")}` : undefined}>
                    {w?.volume != null ? fmtK(w.volume) : "—"}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: w?.difficulty != null ? kdColor(w.difficulty) : "var(--color-text-tertiary)" }}>
                    {w?.difficulty != null ? w.difficulty : "—"}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 600, color: potential != null && potential > 0 ? "var(--color-success)" : "var(--color-text-tertiary)" }}>
                    {potential != null ? `+${fmtK(potential)}` : "—"}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {!guest && (
                      <button type="button" onClick={() => openBuy([item])} title={t("mlBuyOne")}
                        style={{ width: "26px", height: "26px", borderRadius: "7px", border: "1px solid rgba(124,58,237,0.35)", background: "rgba(124,58,237,0.08)", color: "#7C3AED", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        <ShoppingCart size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <Pager page={safePage} pageCount={pageCount} pageSize={pageSize} total={rows.length} shown={visible.length}
              onPage={setPage} onPageSize={n => { setPageSize(n); setPage(0); }} unit={t("sdkBadge")} />
          </div>
        </div>
      </div>

      {buyRows && (
        <BuyLinksModal siteId={siteDbId} rows={buyRows} onClose={() => setBuyRows(null)} onDone={loadPurchases} />
      )}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
// `initialDays` / `onDaysChange` are still accepted from the pages that pass them (a shared link
// may carry ?days=), but there is no period to choose: the rows are one 90-day total per pair,
// and the header states which 90 days.
export default function StrikingDistanceKeywords({ siteDbId }: { siteDbId: string; initialDays?: number; onDaysChange?: (days: number) => void }) {
  const { t } = useLanguage();
  const guest = isGuestView();
  const isPortfolio = siteDbId === "all";
  const [posFrom, setPosFrom] = usePersistedState<number>("gsc_striking_from", 4, v => typeof v === "number" && v >= 1 && v <= 100);
  const [posTo, setPosTo] = usePersistedState<number>("gsc_striking_to", 20, v => typeof v === "number" && v >= 1 && v <= 100);
  const [minImpr, setMinImpr] = usePersistedState<number>("gsc_striking_min_impr", 10, v => typeof v === "number" && v >= 1);
  const [sites, setSites] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("gain");

  // ── data — debounced (typing a position fires on every keystroke); loading is derived ──
  const sitesKey = idsKey(sites);
  const reqKey = `${siteDbId}|${posFrom}|${posTo}|${minImpr}|${sitesKey}`;
  const [resp, setResp] = useState<{ key: string; data: StrikingResponse } | null>(null);
  useEffect(() => {
    if (!siteDbId) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      fetch(withShare("/api/gsc/striking"), {
        method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, posFrom, posTo: Math.max(posFrom, posTo), minImpressions: minImpr, ...(sitesKey ? { sites: sitesKey.split(",") } : {}) }),
      })
        .then(async r => {
          const j = await r.json().catch(() => ({}));
          setResp({ key: reqKey, data: r.ok ? j : { error: j.error ?? `HTTP ${r.status}` } });
        })
        .catch(e => { if (!ac.signal.aborted) setResp({ key: reqKey, data: { error: String(e?.message ?? e) } }); });
    }, 350);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [reqKey, siteDbId, posFrom, posTo, minImpr, sitesKey]);
  const loading = resp?.key !== reqKey;
  const data = resp?.data;
  const keywords = useMemo(() => data?.keywords ?? [], [data]);

  const [siteList, setSiteList] = useState<SiteSummary[]>([]);
  if (data?.sites && data.sites !== siteList) setSiteList(data.sites);
  const multiSite = useMemo(() => new Set(keywords.map(k => k.siteId)).size > 1, [keywords]);

  // ── filter (search) — before weights, so the paid scope follows what's on screen ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? keywords.filter(k => k.query.toLowerCase().includes(q) || k.fullUrl.toLowerCase().includes(q)) : keywords;
  }, [keywords, search]);

  // Weights live beside the GSC rows rather than inside them: they arrive later, from a
  // different source, and may never arrive at all. All the paid-fetch logic is in the shared
  // hook so this view and Rank Tracker cannot drift apart on pricing or cache keys.
  const [country, setCountryS] = useState("us");
  // localStorage only after mount — reading it during render would make the first client pass
  // disagree with the server-rendered HTML.
  useEffect(() => { setCountryS(localStorage.getItem("seoMetricsCountry") || "us"); }, []);
  const setCountry = (v: string) => { setCountryS(v); localStorage.setItem("seoMetricsCountry", v); };

  const weightQueries = useMemo(() => {
    // Rows arrive ordered by est. gain; the paid scope is the first WEIGHT_CAP distinct queries.
    const out: string[] = [];
    const seen = new Set<string>();
    for (const k of filtered) {
      const q = wKey(k.query);
      if (!q || seen.has(q)) continue;
      seen.add(q); out.push(q);
      if (out.length >= WEIGHT_CAP) break;
    }
    return out;
  }, [filtered]);
  const targets = useMemo(() => weightQueries.map(keyword => ({ keyword, country })), [weightQueries, country]);
  const weights = useKeywordWeights(targets, {
    // Guests on a share link have no session and the metrics endpoints are owner-scoped.
    enabled: !guest,
    onError: code => (code === "cap_exceeded" ? t("kwCapExceeded") : t("kwLoadFailed")),
  });
  const distinctFiltered = useMemo(() => new Set(filtered.map(k => wKey(k.query))).size, [filtered]);

  const sorted = useMemo(() => {
    if (sortKey === "potential") {
      // Rows without a weight sort last rather than as zero — "unknown" and "nothing to gain"
      // are different answers, and mixing them hides the keywords worth loading next.
      return [...filtered].sort((a, b) => {
        const pa = potentialOf(a, weights.get(a.query, country));
        const pb = potentialOf(b, weights.get(b.query, country));
        if (pa == null && pb == null) return b.gain - a.gain;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      });
    }
    return [...filtered].sort((a, b) => sortKey === "position" ? a.position - b.position : b[sortKey] - a[sortKey]);
  }, [filtered, sortKey, weights, country]);

  const siteOptions = useMemo<SiteOption[]>(() => siteList.map(s => ({
    siteId: s.siteId, siteName: s.siteName, tags: s.tags,
    active: s.keywords > 0,
    weight: s.gain,
    figure: s.gain > 0 ? `+${fmtK(s.gain)}` : "0",
    figureColor: "var(--color-success)",
    badges: [{ n: s.keywords, color: "#F59E0B", title: t("sdkBadge") }],
  })), [siteList, t]);

  function exportCsv() {
    const headers = [
      "Query", "URL", ...(multiSite ? ["Site"] : []), "Impressions", "Clicks", "CTR %", "Position",
      `Est. +clicks at #${TARGET_POSITION}`, "Volume", "KD", "Potential",
    ];
    const body = sorted.map(k => {
      const w = weights.get(k.query, country);
      return [
        k.query, k.fullUrl, ...(multiSite ? [k.siteName] : []), k.impressions, k.clicks, k.ctr, k.position,
        k.gain, w?.volume ?? "", w?.difficulty ?? "", potentialOf(k, w) ?? "",
      ];
    });
    const name = !multiSite ? (keywords[0]?.siteName ?? "site") : "portfolio";
    downloadCsv(`striking-distance-${fileSlug(name)}-${data?.window?.end ?? new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  const header = (
    <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ padding: "4px 12px", borderRadius: "20px", background: "rgba(245,158,11,0.1)", fontSize: "12px", fontWeight: 600, color: "#F59E0B" }}>
              {(data?.total ?? keywords.length).toLocaleString()} {t("sdkBadge")}
            </span>
            {filtered.length > 0 && (
              <span style={{ padding: "4px 12px", borderRadius: "20px", background: "rgba(16,185,129,0.1)", fontSize: "12px", fontWeight: 600, color: "#10B981" }}
                title={t("sdkGainHint").replace("{pos}", String(TARGET_POSITION))}>
                {t("sdkGainTotal").replace("{n}", fmtK(filtered.reduce((s, k) => s + k.gain, 0)))}
              </span>
            )}
          </div>
          <WindowNote window={data?.window} mixed={data?.mixedWindows} />
          {data?.truncated && (
            <div style={{ fontSize: 12, color: "var(--color-warning)" }}>
              {t("sdkTruncated").replace("{n}", keywords.length.toLocaleString()).replace("{total}", (data.total ?? 0).toLocaleString())}
            </div>
          )}
        </div>
        {isPortfolio && siteOptions.length > 0 && (
          <SitePicker sites={siteOptions} selected={sites} onChange={setSites}
            labels={{ onlyActive: t("sdkSitesOnlyActive"), sortWeight: t("sdkColGain"), none: t("sdkSitesNone") }} />
        )}
      </div>
      {isPortfolio && <SelectedSiteChips sites={siteList} selected={sites} onChange={setSites} />}
      {data?.error && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, color: "#f87171" }}>{data.error}</div>
      )}
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden", marginTop: "20px", background: "var(--color-card)" }}>
      <InfoBlock posFrom={posFrom} setPosFrom={setPosFrom} posTo={posTo} setPosTo={setPosTo} minImpr={minImpr} setMinImpr={setMinImpr} />
      {!guest && <KeywordWeightsBar w={weights} country={country} setCountry={setCountry} />}
      {!guest && distinctFiltered > WEIGHT_CAP && (
        <div style={{ padding: "6px 28px", fontSize: 12, color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)" }}>
          {t("sdkWeightScope").replace("{n}", String(WEIGHT_CAP)).replace("{total}", distinctFiltered.toLocaleString())}
        </div>
      )}
      <KeywordsTable
        rows={sorted} loading={loading} siteDbId={siteDbId} weights={weights} country={country}
        sortKey={sortKey} setSortKey={setSortKey} search={search} setSearch={setSearch}
        multiSite={multiSite} onSelectSite={isPortfolio ? (id => setSites([id])) : undefined}
        onExport={exportCsv} header={header}
      />
    </div>
  );
}
