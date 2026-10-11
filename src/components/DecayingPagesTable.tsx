"use client";

// Decaying pages — the table half of the Content Decay Map.
//
// Rebuilt for #28. What it used to be: the 20 biggest pages, the last two calendar buckets
// (current partial month included) against the two before, five rows on screen with no paging,
// and a truncated path you could neither open nor copy. What it is now:
//  • every page the site has, compared over two equal complete windows (src/lib/decay/logic.ts),
//    with a noise floor the user can move and a "Lost" status for pages that went to zero;
//  • filters (status, HTTP, URL text), sorting, real pagination;
//  • an HTTP check per row or for the whole filtered list — first status, the redirect chain and
//    where it lands — because "is the old URL a 404 or a 301 to the right place" is the first
//    question after a migration;
//  • CSV of exactly what the filters show, across all pages, status and redirect target included.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, ShieldCheck, Square } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { withShare, isGuestView } from "@/lib/shareParam";
import { usePersistedState } from "@/lib/usePersistedState";
import { getKeywordCapableCreds } from "@/lib/seo/metricsClient";
import { redirectHops, toCsv, type DecayStatus, type HttpCheckResult, type HttpVerdict } from "@/lib/decay/logic";
import UrlCell from "@/components/UrlCell";
import DecaySitePicker, { SelectedSiteChips, type SiteSummary } from "@/components/DecaySitePicker";

type Metric = "clicks" | "impressions";
type Period = "month" | "week";
type StatusFilter = "all" | DecayStatus;
type HttpFilter = "all" | "unchecked" | HttpVerdict;
type SortKey = "change" | "changePct" | "previous" | "current" | "yoyPct";

interface DecayRow {
  siteId: string; siteName: string; url: string; page: string;
  current: number; previous: number; change: number; changePct: number; yoyPct: number | null;
  status: DecayStatus;
}
interface WindowInfo {
  current: { start: string; end: string };
  previous: { start: string; end: string };
  days: number;
  yoyAvailable: boolean;
}
interface DecayResponse {
  decay?: DecayRow[];
  decayTotal?: number;
  decayTruncated?: boolean;
  decayExamined?: number;
  decayWindows?: WindowInfo | null;
  decayMixedWindows?: boolean;
  decaySites?: SiteSummary[];
  error?: string;
}
type HttpResult = HttpCheckResult & { siteId: string };

const MIN_CHOICES: Record<Metric, number[]> = {
  clicks: [1, 5, 10, 25, 50, 100, 500],
  impressions: [10, 50, 100, 250, 500, 1000, 5000],
};
const MIN_DEFAULT: Record<Metric, number> = { clicks: 5, impressions: 100 };
const PAGE_SIZES = [10, 25, 50, 100];
/** Matches MAX_ITEMS in /api/gsc/decay/status. */
const HTTP_BATCH = 20;

const STATUS_COLOR: Record<DecayStatus, string> = { Lost: "#A855F7", Critical: "#EF4444", Warning: "#F59E0B" };
const HTTP_COLOR: Record<HttpVerdict, string> = {
  ok: "#10B981", redirect: "#3B82F6", client_error: "#EF4444", server_error: "#F97316", error: "#94A3B8",
};

const keyOf = (r: { siteId: string; url: string }) => `${r.siteId}\n${r.url}`;
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

function shortUrl(url: string, relativeTo: string): string {
  try {
    const a = new URL(url), b = new URL(relativeTo);
    return a.host === b.host ? (a.pathname + a.search || "/") : a.host + (a.pathname === "/" ? "" : a.pathname) + a.search;
  } catch { return url; }
}

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ─── small pieces ────────────────────────────────────────────────────────────────

const chipBtn = (active: boolean, color = "#3B82F6"): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999,
  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${active ? color : "var(--color-border)"}`,
  background: active ? `${color}1a` : "transparent",
  color: active ? color : "var(--color-text-secondary)",
});
const selectStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: 7, fontSize: 12, border: "1px solid var(--color-border)",
  background: "var(--color-card)", color: "var(--color-text-primary)", cursor: "pointer", outline: "none",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7,
  border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)",
  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};

function HttpCell({ r, onCheck, busy, canCheck }: { r: HttpResult | undefined; onCheck: () => void; busy: boolean; canCheck: boolean }) {
  const { t } = useLanguage();
  if (!r) {
    if (!canCheck) return <span style={{ color: "var(--color-text-tertiary)" }}>—</span>;
    return (
      <button type="button" className="metric-chip" onClick={e => { e.stopPropagation(); onCheck(); }} disabled={busy}
        style={{ border: "1px solid var(--color-border)", background: "transparent", fontWeight: 500, cursor: busy ? "default" : "pointer" }}>
        {busy ? "…" : t("cdmHttpCheck")}
      </button>
    );
  }
  const color = HTTP_COLOR[r.verdict];
  const hops = redirectHops(r);
  const title = [
    ...r.chain.map(h => `${h.status}  ${h.url}`),
    ...(r.error ? [`${t("cdmHttpError")}: ${r.error}`] : []),
    ...(hops > 1 ? [t("cdmHttpHopsHint").replace("{n}", String(hops))] : []),
  ].join("\n");
  const label = r.status === 0
    ? t("cdmHttpError")
    : r.finalUrl && r.finalStatus == null ? `${r.status} → ✕`
    : r.finalStatus != null && r.finalStatus !== r.status ? `${r.status} → ${r.finalStatus}` : String(r.status);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 0, maxWidth: "100%" }}>
      <span title={title} style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6,
        fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        color, background: `${color}18`, border: `1px solid ${color}40`,
      }}>
        {label}{hops > 1 && <span style={{ fontWeight: 600, opacity: 0.8 }}>×{hops}</span>}
      </span>
      {r.finalUrl && (
        <span style={{ maxWidth: "100%", minWidth: 0, display: "flex", justifyContent: "flex-end" }}>
          <UrlCell label={`→ ${shortUrl(r.finalUrl, r.url)}`} href={r.finalUrl} fontSize={11} color="var(--color-text-secondary)" />
        </span>
      )}
    </div>
  );
}

// ─── table ───────────────────────────────────────────────────────────────────────

export default function DecayingPagesTable({ siteDbId, defaultPeriod, selectedSites = null, onSelectSites }: {
  siteDbId: string;
  defaultPeriod?: Period;
  /** Portfolio only: the picker's selection, owned by the parent so the heatmap follows it. null = all. */
  selectedSites?: string[] | null;
  onSelectSites?: (next: string[] | null) => void;
}) {
  const { t } = useLanguage();
  const guest = isGuestView();
  const isPortfolio = siteDbId === "all";

  const [metric, setMetric] = usePersistedState<Metric>("gsc_decay_table_metric", "clicks", v => v === "clicks" || v === "impressions");
  const [period, setPeriod] = usePersistedState<Period>("gsc_decay_table_window", defaultPeriod ?? "month", v => v === "month" || v === "week");
  const [minClicks, setMinClicks] = usePersistedState<number>("gsc_decay_min_clicks", MIN_DEFAULT.clicks, v => typeof v === "number" && v >= 1);
  const [minImpr, setMinImpr] = usePersistedState<number>("gsc_decay_min_impressions", MIN_DEFAULT.impressions, v => typeof v === "number" && v >= 1);
  const [pageSize, setPageSize] = usePersistedState<number>("gsc_decay_page_size", 25, v => typeof v === "number" && PAGE_SIZES.includes(v));
  const min = metric === "clicks" ? minClicks : minImpr;
  const setMin = (n: number) => (metric === "clicks" ? setMinClicks(n) : setMinImpr(n));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [httpFilter, setHttpFilter] = useState<HttpFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "change", dir: 1 });
  const [page, setPage] = useState(0);

  // ── data ── loading is derived (the response's key vs the wanted key) rather than set in the
  // effect, so a refetch keeps the old rows on screen, dimmed, instead of flashing empty.
  const sitesKey = selectedSites?.length ? [...selectedSites].sort().join(",") : "";
  const reqKey = `${siteDbId}|${period}|${metric}|${min}|${sitesKey}`;
  const [resp, setResp] = useState<{ key: string; data: DecayResponse } | null>(null);
  useEffect(() => {
    if (!siteDbId) return;
    const ac = new AbortController();
    // POST: the site selection can be hundreds of ids, past what a URL carries.
    fetch(withShare("/api/gsc/decay"), {
      method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: siteDbId, parts: ["decay"], metric, period, min, ...(sitesKey ? { sites: sitesKey.split(",") } : {}) }),
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        setResp({ key: reqKey, data: r.ok ? j : { error: j.error ?? `HTTP ${r.status}` } });
      })
      .catch(e => { if (!ac.signal.aborted) setResp({ key: reqKey, data: { error: String(e?.message ?? e) } }); });
    return () => ac.abort();
  }, [reqKey, siteDbId, metric, period, min, sitesKey]);
  const loading = resp?.key !== reqKey;
  const data = resp?.data;
  const rows = useMemo(() => data?.decay ?? [], [data]);
  // Keep the last known site list while a refetch is in flight, so the picker doesn't empty out.
  const [siteList, setSiteList] = useState<SiteSummary[]>([]);
  // Adjusted during render (React's "storing information from previous renders"), not in an effect.
  if (data?.decaySites && data.decaySites !== siteList) setSiteList(data.decaySites);
  const siteSummaries = data?.decaySites ?? siteList;
  const selectSites = (next: string[] | null) => { onSelectSites?.(next); setPage(0); };
  const win = data?.decayWindows ?? null;
  // On a portfolio, a site badge per row — unless every row is the same site anyway.
  const multiSite = useMemo(() => new Set(rows.map(r => r.siteId)).size > 1, [rows]);

  // ── HTTP checks — kept by URL across refetches; a status doesn't change with the filters ──
  const [http, setHttp] = useState<Record<string, HttpResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [httpBusyKey, setHttpBusyKey] = useState<string | null>(null);
  const [httpErr, setHttpErr] = useState("");
  const stopRef = useRef(false);

  async function runChecks(list: DecayRow[], single = false) {
    if (!list.length || progress) return;
    stopRef.current = false;
    setHttpErr("");
    if (single) setHttpBusyKey(keyOf(list[0])); else setProgress({ done: 0, total: list.length });
    try {
      for (let i = 0; i < list.length; i += HTTP_BATCH) {
        if (stopRef.current) break;
        const batch = list.slice(i, i + HTTP_BATCH);
        const res = await fetch("/api/gsc/decay/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batch.map(r => ({ siteId: r.siteId, url: r.url })) }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHttpErr(res.status === 403 ? t("cdmHttpForbidden") : String(j.error ?? `HTTP ${res.status}`));
          break;
        }
        const got: Record<string, HttpResult> = {};
        for (const r of (j.results ?? []) as HttpResult[]) got[keyOf(r)] = r;
        setHttp(prev => ({ ...prev, ...got }));
        if (!single) setProgress({ done: Math.min(i + HTTP_BATCH, list.length), total: list.length });
      }
    } catch (e) {
      setHttpErr(String((e as Error)?.message ?? e));
    } finally {
      setProgress(null);
      setHttpBusyKey(null);
    }
  }

  // ── demand (unchanged behaviour: one page at a time, on request) ──
  const [demand, setDemand] = useState<Record<string, { keyword: string; trendPct: number | null; err?: string }>>({});
  const [demandBusy, setDemandBusy] = useState<string | null>(null);
  async function checkDemand(row: DecayRow) {
    if (demandBusy || !row.siteId) return;
    setDemandBusy(row.url);
    try {
      // Volume history is keyword-side data — resolves off Majestic onto a keyword-capable key.
      const creds = getKeywordCapableCreds();
      const res = await fetch("/api/metrics/demand", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: row.siteId, url: row.url,
          country: localStorage.getItem("seoMetricsCountry") || "us",
          fetch: true, provider: creds.provider, apiKey: creds.apiKey, baseUrl: creds.baseUrl, cap: creds.cap,
        }),
      });
      const d = await res.json();
      setDemand(prev => ({ ...prev, [row.url]: { keyword: d.keyword ?? "", trendPct: d.trendPct ?? null, err: d.error } }));
    } catch {
      setDemand(prev => ({ ...prev, [row.url]: { keyword: "", trendPct: null, err: "failed" } }));
    }
    setDemandBusy(null);
  }

  // ── filter → sort → page ──
  const counts = useMemo(() => {
    const c: Record<DecayStatus, number> = { Lost: 0, Critical: 0, Warning: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.url.toLowerCase().includes(q)) return false;
      if (httpFilter !== "all") {
        const h = http[keyOf(r)];
        if (httpFilter === "unchecked") return !h;
        if (!h || h.verdict !== httpFilter) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, httpFilter, http]);

  const sorted = useMemo(() => {
    const val = (r: DecayRow): number => {
      const v = r[sort.key];
      // Rows without YoY always sink, whichever way the column is sorted.
      return v == null ? (sort.dir === 1 ? Infinity : -Infinity) : v;
    };
    return [...filtered].sort((a, b) => (val(a) - val(b)) * sort.dir || a.changePct - b.changePct);
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const unchecked = filtered.filter(r => !http[keyOf(r)]);

  const resetPage = () => setPage(0);
  const toggleSort = (key: SortKey) => {
    // Losses are negative: the "worst first" direction for change/changePct/yoy is ascending,
    // for the volume columns it's descending.
    const worstFirst: 1 | -1 = key === "previous" || key === "current" ? -1 : 1;
    setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: worstFirst }));
    resetPage();
  };

  function exportCsv() {
    const headers = [
      "URL", ...(multiSite ? ["Site"] : []), "Status",
      `${metric} before`, `${metric} now`, "Change", "Change %", "YoY %",
      "HTTP status", "Final status", "Redirects to", "Redirect hops", "HTTP error",
      "Demand trend %",
    ];
    const body = sorted.map(r => {
      const h = http[keyOf(r)];
      const d = demand[r.url];
      return [
        r.url, ...(multiSite ? [r.siteName] : []), r.status,
        r.previous, r.current, r.change, r.changePct, r.yoyPct,
        h ? (h.status || "") : "", h?.finalStatus ?? "", h?.finalUrl ?? "", h ? redirectHops(h) : "", h?.error ?? "",
        d && !d.err && d.trendPct != null ? d.trendPct : "",
      ];
    });
    const one = !isPortfolio || selectedSites?.length === 1 || !multiSite;
    const site = (one ? rows[0]?.siteName || "site" : "portfolio").replace(/[^a-z0-9.-]+/gi, "_");
    downloadCsv(`decaying-pages-${site}-${win?.current.end ?? new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));
  }

  // ── render ──
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  const thSort = (key: SortKey, label: string, hint?: string) => (
    <button type="button" onClick={() => toggleSort(key)} title={hint}
      style={{ all: "unset", cursor: "pointer", textAlign: "right", width: "100%", color: sort.key === key ? "var(--color-text-primary)" : undefined }}>
      {label}{sortMark(key)}
    </button>
  );
  const COLS = "minmax(240px,1fr) 76px 76px 118px 64px 132px 104px 84px";
  const statusLabel: Record<DecayStatus, string> = { Lost: t("cdmStatusLost"), Critical: t("cdmStatusCritical"), Warning: t("cdmStatusWarning") };
  const metricLabel = metric === "clicks" ? t("clicks") : t("impressions");

  return (
    <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--color-border)" }}>
      {/* Title + window */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>{t("cdmTableTitle")}</div>
          {win && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {t("cdmWindowCompare")
                .replace(/\{days\}/g, String(win.days))
                .replace("{cur}", `${fmtDay(win.current.start)} – ${fmtDay(win.current.end)}`)
                .replace("{prev}", `${fmtDay(win.previous.start)} – ${fmtDay(win.previous.end)}`)}
              {data?.decayExamined != null && (
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  {" · "}{t("cdmExamined").replace("{flagged}", (data.decayTotal ?? rows.length).toLocaleString()).replace("{examined}", data.decayExamined.toLocaleString())}
                </span>
              )}
            </div>
          )}
          {data?.decayMixedWindows && (
            <div style={{ fontSize: 11.5, color: "var(--color-text-tertiary)", marginTop: 2 }}>{t("cdmMixedWindows")}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {isPortfolio && onSelectSites && siteSummaries.length > 0 && (
            <>
              <DecaySitePicker sites={siteSummaries} selected={selectedSites} onChange={selectSites} />
              <span style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 2px" }} />
            </>
          )}
          {(["month", "week"] as Period[]).map(p => (
            <button key={p} type="button" onClick={() => { setPeriod(p); resetPage(); }} style={chipBtn(period === p)}>
              {p === "month" ? t("cdmWindow8w") : t("cdmWindow2w")}
            </button>
          ))}
          <span style={{ width: 1, height: 18, background: "var(--color-border)", margin: "0 2px" }} />
          {(["clicks", "impressions"] as Metric[]).map(m => (
            <button key={m} type="button" onClick={() => { setMetric(m); resetPage(); }} style={chipBtn(metric === m)}>
              {m === "clicks" ? t("clicks") : t("impressions")}
            </button>
          ))}
        </div>
      </div>

      {isPortfolio && onSelectSites && <SelectedSiteChips sites={siteSummaries} selected={selectedSites} onChange={selectSites} />}

      {/* Status chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button type="button" onClick={() => { setStatusFilter("all"); resetPage(); }} style={chipBtn(statusFilter === "all")}>
          {t("all")} <span style={{ opacity: 0.75 }}>{rows.length.toLocaleString()}</span>
        </button>
        {(["Lost", "Critical", "Warning"] as DecayStatus[]).map(s => (
          <button key={s} type="button" onClick={() => { setStatusFilter(s); resetPage(); }} style={chipBtn(statusFilter === s, STATUS_COLOR[s])}
            title={s === "Lost" ? t("cdmLostHint") : undefined}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[s] }} />
            {statusLabel[s]} <span style={{ opacity: 0.75 }}>{counts[s].toLocaleString()}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder={t("cdmSearchUrl")}
            style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 7, fontSize: 12.5, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-primary)", outline: "none" }} />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }} title={t("cdmMinPreviousHint")}>
          {t("cdmMinPrevious")}
          <select value={min} onChange={e => { setMin(Number(e.target.value)); resetPage(); }} style={selectStyle}>
            {[...new Set([...MIN_CHOICES[metric], min])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </label>
        {!guest && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
            HTTP
            <select value={httpFilter} onChange={e => { setHttpFilter(e.target.value as HttpFilter); resetPage(); }} style={selectStyle}>
              <option value="all">{t("all")}</option>
              <option value="unchecked">{t("cdmHttpUnchecked")}</option>
              <option value="ok">{t("cdmHttpOk")}</option>
              <option value="redirect">{t("cdmHttpRedirect")}</option>
              <option value="client_error">{t("cdmHttpClient")}</option>
              <option value="server_error">{t("cdmHttpServer")}</option>
              <option value="error">{t("cdmHttpError")}</option>
            </select>
          </label>
        )}
        <div style={{ flex: 1 }} />
        {!guest && (progress ? (
          <button type="button" onClick={() => { stopRef.current = true; }} style={ghostBtn}>
            <Loader2 size={13} className="spin" style={{ animation: "spin 0.8s linear infinite" }} />
            {t("cdmHttpChecking").replace("{done}", String(progress.done)).replace("{total}", String(progress.total))}
            <Square size={11} style={{ marginLeft: 2 }} /> {t("cdmHttpStop")}
          </button>
        ) : (
          <button type="button" onClick={() => runChecks(unchecked)} disabled={!unchecked.length} title={t("cdmHttpCheckAllHint")}
            style={{ ...ghostBtn, opacity: unchecked.length ? 1 : 0.5, cursor: unchecked.length ? "pointer" : "default" }}>
            <ShieldCheck size={13} /> {t("cdmHttpCheckAll").replace("{n}", unchecked.length.toLocaleString())}
          </button>
        ))}
        <button type="button" onClick={exportCsv} disabled={!sorted.length} title={t("exportCsv")}
          style={{ ...ghostBtn, opacity: sorted.length ? 1 : 0.5 }}>
          <Download size={13} /> CSV
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {httpErr && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, color: "#f87171", marginBottom: 10 }}>
          {httpErr}
        </div>
      )}
      {data?.error && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, color: "#f87171", marginBottom: 10 }}>
          {data.error}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", opacity: loading && resp ? 0.55 : 1, transition: "opacity 0.15s" }}>
        <div style={{ minWidth: 920 }}>
          <div style={{
            display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 12px",
            background: "var(--color-bg)", borderRadius: "8px 8px 0 0",
            border: "1px solid var(--color-border)", borderBottom: "none",
            fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)",
          }}>
            <div>{t("cdmPage")}</div>
            <div style={{ textAlign: "right" }}>{thSort("previous", t("cdmBefore"), `${metricLabel} · ${win ? `${fmtDay(win.previous.start)} – ${fmtDay(win.previous.end)}` : ""}`)}</div>
            <div style={{ textAlign: "right" }}>{thSort("current", t("cdmNow"), `${metricLabel} · ${win ? `${fmtDay(win.current.start)} – ${fmtDay(win.current.end)}` : ""}`)}</div>
            <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 6 }}>
              {thSort("change", t("cdmChange"))}
              <button type="button" onClick={() => toggleSort("changePct")} title="%" style={{ all: "unset", cursor: "pointer", color: sort.key === "changePct" ? "var(--color-text-primary)" : undefined }}>%{sortMark("changePct")}</button>
            </div>
            <div style={{ textAlign: "right" }}>{thSort("yoyPct", t("cdmYoY"), t("cdmYoyHint"))}</div>
            <div style={{ textAlign: "right" }}>HTTP</div>
            <div style={{ textAlign: "right" }} title={t("cdmDemandHint")}>{t("cdmDemand")}</div>
            <div style={{ textAlign: "right" }}>{t("cdmStatus")}</div>
          </div>

          <div className="privacy-blur-all" style={{ border: "1px solid var(--color-border)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {!resp && loading ? (
              <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
                <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> {t("loading")}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
                {!win && !data?.error ? t("cdmNoPageData") : rows.length === 0 ? t("cdmNoDecay") : t("cdmNoMatches")}
              </div>
            ) : visible.map((row, i) => {
              const k = keyOf(row);
              const d = demand[row.url];
              return (
                <div key={k} style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "10px 12px",
                  borderBottom: i < visible.length - 1 ? "1px solid var(--color-border)" : "none",
                  background: i % 2 === 0 ? "var(--color-card)" : "rgba(255,255,255,0.02)",
                  alignItems: "center", fontSize: 13, fontVariantNumeric: "tabular-nums",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                    <UrlCell label={row.page} href={row.url} />
                    {multiSite && row.siteName && (onSelectSites ? (
                      <button type="button" onClick={e => { e.stopPropagation(); selectSites([row.siteId]); }} title={t("cdmSitesFilterHint")}
                        style={{ fontSize: 10, color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, flexShrink: 0, border: "none", cursor: "pointer" }}>
                        {row.siteName}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }} title={row.siteName}>
                        {row.siteName}
                      </span>
                    ))}
                    {!guest && (
                      <Link href={`/seo-tools/rewrite?url=${encodeURIComponent(row.url)}`} title={t("cdmRewrite")}
                        onClick={e => e.stopPropagation()}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "2px 7px", borderRadius: 6, border: "1px solid var(--color-border)", color: "#34c759", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                        <RefreshCw size={11} /> {t("cdmRewrite")}
                      </Link>
                    )}
                  </div>
                  <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{row.previous.toLocaleString()}</div>
                  <div style={{ textAlign: "right", color: "var(--color-text-primary)", fontWeight: 600 }}>{row.current.toLocaleString()}</div>
                  <div style={{ textAlign: "right", color: "#EF4444", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {signed(row.change)} <span style={{ fontSize: 11.5, fontWeight: 500 }}>({row.changePct}%)</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {row.yoyPct == null
                      ? <span style={{ color: "var(--color-text-tertiary)" }} title={win?.yoyAvailable ? undefined : t("cdmYoyHint")}>—</span>
                      : <span style={{ color: row.yoyPct < 0 ? "#EF4444" : "#10B981" }}>{row.yoyPct > 0 ? "+" : ""}{row.yoyPct}%</span>}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 0, display: "flex", justifyContent: "flex-end" }}>
                    <HttpCell r={http[k]} canCheck={!guest} busy={httpBusyKey === k || !!progress} onCheck={() => runChecks([row], true)} />
                  </div>
                  {/* Demand: clicks falling with demand flat is a ranking problem; clicks falling
                      with demand is the market, and no rewrite fixes that. Fetched only on request. */}
                  <div style={{ textAlign: "right", fontSize: 12 }}>
                    {guest ? <span style={{ color: "var(--color-text-secondary)" }}>—</span>
                      : d ? (
                        // Volume history is Ahrefs-only — say so rather than a dash that reads as "flat".
                        d.err === "provider_unsupported"
                          ? <span title={t("blpAhrefsOnly")} style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>Ahrefs</span>
                        : d.err || d.trendPct == null ? <span style={{ color: "var(--color-text-secondary)" }}>—</span>
                        : (
                          <span title={d.keyword} style={{ fontWeight: 700, color: d.trendPct <= -15 ? "var(--color-warning)" : "var(--color-success)" }}>
                            {d.trendPct > 0 ? "+" : ""}{d.trendPct}%
                            <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: "var(--color-text-secondary)" }}>
                              {d.trendPct <= -15 ? t("cdmDemandFalling") : t("cdmDemandStable")}
                            </span>
                          </span>
                        )
                      ) : (
                        <button type="button" className="metric-chip" onClick={e => { e.stopPropagation(); checkDemand(row); }}
                          disabled={demandBusy === row.url}
                          style={{ border: "1px solid var(--color-border)", background: "transparent", fontWeight: 500, cursor: "pointer" }}>
                          {demandBusy === row.url ? "…" : t("cdmDemandLoad")}
                        </button>
                      )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span title={row.status === "Lost" ? t("cdmLostHint") : undefined} style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      color: STATUS_COLOR[row.status], background: `${STATUS_COLOR[row.status]}18`, border: `1px solid ${STATUS_COLOR[row.status]}40`,
                    }}>{statusLabel[row.status]}</span>
                  </div>
                </div>
              );
            })}

            {/* Footer: count + paging */}
            <div style={{
              padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
              background: "var(--color-bg)", borderTop: "1px solid var(--color-border)",
              fontSize: 12, color: "var(--color-text-secondary)",
            }}>
              <span>
                {t("cdmShowingRows")
                  .replace("{start}", sorted.length ? String(safePage * pageSize + 1) : "0")
                  .replace("{end}", String(safePage * pageSize + visible.length))
                  .replace("{total}", sorted.length.toLocaleString())}
                {data?.decayTruncated && (
                  <span style={{ color: "var(--color-warning)", marginLeft: 8 }}>
                    {t("cdmTruncated").replace("{n}", rows.length.toLocaleString()).replace("{total}", (data.decayTotal ?? 0).toLocaleString())}
                  </span>
                )}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{t("cdmRowsPerPage")}</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); resetPage(); }} style={selectStyle}>
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button type="button" aria-label={t("prev")} onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
                  style={{ ...ghostBtn, padding: "4px 6px", opacity: safePage === 0 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{safePage + 1} / {pageCount}</span>
                <button type="button" aria-label={t("cdmNext")} onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1}
                  style={{ ...ghostBtn, padding: "4px 6px", opacity: safePage >= pageCount - 1 ? 0.4 : 1 }}><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
