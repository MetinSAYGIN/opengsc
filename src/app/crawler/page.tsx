"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, Fingerprint, Globe2, Info, Layers, Loader2, Megaphone, Radar, Search,
  BarChart3, Eye, Server, ShieldAlert, Trash2, XCircle,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { buildScanMarkdown } from "@/lib/scanner/exportMd";
import type { Fingerprints } from "@/lib/scanner/fingerprints";
import { getMetricsCreds } from "@/lib/seo/metricsClient";
import AdsIntelTab from "@/components/AdsIntelTab";
import { downloadFile } from "@/lib/seo/exportFormats";

// A key the translation function accepts. Dynamic strings (error codes, metric notes) are cast
// to it — the same narrowing the uptime status chip on the dashboard uses.
type TKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0];
type Finding = { id: string; severity: "critical" | "warning" | "info"; evidence?: string };
type Related = { host: string; scanId: string; matches: string[]; strength: "strong" | "weak" };
type Report = {
  url: string; finalUrl: string; host: string; https: boolean; httpStatus: number; redirected: boolean;
  loadMs: number; bytes: number;
  facts: { title: string; titleLength: number; metaDescription: string; h1Count: number; wordCount: number; canonical: string | null; robots: string; indexable: boolean | null; schemaBlocks: number; imagesNoAlt: number; language: string };
  findings: Finding[]; score: number;
  platform: { cms: string | null; generator: string | null; framework: string | null; server: string | null; poweredBy: string | null; hints: string[]; wordpress?: { themes: string[]; plugins: string[]; restUsers: string[]; xmlrpc: boolean; readme: boolean } };
  infra: { ips: string[]; nameservers: string[]; mx: string[]; cdn: string | null };
  scale: { sitemaps: string[]; sitemapUrls: number | null; languages: string[] };
  ai: { robotsTxt: boolean; llmsTxt: boolean; blockedBots: string[] };
  cloaking: null | { verdict: "clean" | "suspicious" | "cloaking" | "unknown"; score: number; flags: string[];
    googlebot: { status: number; finalUrl: string; title: string; words: number; indexable: boolean; blocked?: boolean };
    browser: { status: number; finalUrl: string; title: string; words: number; indexable: boolean };
    redirectChain: string[] };
  fingerprints: Fingerprints;
  fingerprintKeys: string[];
  scannedAt: string;
};
type Scan = {
  id: string; host: string; url: string; finalUrl: string | null; status: string; httpStatus: number;
  score: number | null; error: string | null; report: Report | null; createdAt: string; related: Related[];
};
// Cached domain metrics as /api/metrics/domain returns them (CachedDomain). The alias keys
// (domainRating, referringDomains, traffic, organicTraffic) are legacy names older caches may
// carry; the `??` fallbacks in the panel keep them readable.
type DomainMetrics = {
  dr?: number | null; domainRating?: number | null;
  refDomains?: number | null; referringDomains?: number | null;
  backlinks?: number | null;
  traffic?: number | null; organicTraffic?: number | null;
  checkedAt?: string;
};

export default function CrawlerPage() {
  const { t } = useLanguage();
  const [target, setTarget] = useState("");
  const [scans, setScans] = useState<Scan[]>([]);
  const [current, setCurrent] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notMigrated, setNotMigrated] = useState(false);
  // The history grows one row per check and is the first thing on screen; past a screenful it needs
  // paging for the same reason the audit table does.
  const [page, setPage] = useState(0);
  // Ahrefs/Semrush numbers for the scanned domain. Read from the local cache for free on every
  // scan; fetching fresh ones spends the owner's units, so that stays a separate, priced click.
  const [metrics, setMetrics] = useState<DomainMetrics | null>(null);
  const [metricsBusy, setMetricsBusy] = useState(false);
  const [metricsNote, setMetricsNote] = useState("");
  // Ad intelligence is optional research on top of the scan: collapsed until asked for, since
  // its sections spend GoAnyAPI credits and not every scanned domain deserves the spend.
  const [adsOpen, setAdsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan", { cache: "no-store" });
      const body = await res.json();
      if (body.notMigrated) { setNotMigrated(true); return; }
      setScans(Array.isArray(body.scans) ? body.scans : []);
    } catch { /* the list is a convenience; a failure here must not block a new scan */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function scan() {
    if (!target.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target.trim() }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "scan_failed");
      setCurrent(body.scan);
      if (body.scan?.status === "error") setError(body.scan.error || "scan_failed");
      void load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "scan_failed"); }
    finally { setBusy(false); }
  }

  const loadMetrics = useCallback(async (host: string, spend: boolean) => {
    const creds = getMetricsCreds();
    if (spend && !creds.apiKey) { setMetricsNote("no_key"); return; }
    setMetricsBusy(true); setMetricsNote("");
    try {
      const res = await fetch("/api/metrics/domain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domains: [host], provider: creds.provider, fetch: spend,
          ...(spend ? { apiKey: creds.apiKey, baseUrl: creds.baseUrl, cap: creds.cap } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      setMetrics(body?.metrics?.[host] ?? null);
      if (body?.error) setMetricsNote(String(body.error));
    } catch { setMetricsNote("failed"); }
    finally { setMetricsBusy(false); }
  }, []);

  // A cache read costs nothing and reaches no provider, so it happens automatically; anything that
  // bills the owner never does.
  //
  // Reads `current` rather than the `report` alias: the alias is declared further down, and a
  // dependency array is evaluated during render, so naming it here is a use-before-initialization
  // — which is precisely how this failed the first time.
  const scannedHost = current?.report?.host;
  useEffect(() => {
    if (!scannedHost) return;
    setMetrics(null); setMetricsNote("");
    void loadMetrics(scannedHost, false);
  }, [scannedHost, loadMetrics]);

  async function open(id: string) {
    const res = await fetch(`/api/scan/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setCurrent(body.scan);
  }

  async function remove(id: string) {
    if (!window.confirm(t("crawlerDeleteConfirm"))) return;
    await fetch(`/api/scan/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (current?.id === id) setCurrent(null);
    void load();
  }

  const PAGE_SIZE = 12;
  const pageCount = Math.max(1, Math.ceil(scans.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleScans = scans.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const report = current?.report;

  function exportMarkdown() {
    if (!report) return;
    const md = buildScanMarkdown(report, current?.related ?? [], code => t((ISSUE_KEYS[code] ?? code) as TKey) || code);
    downloadFile(md, `scan-${report.host}-${report.scannedAt.slice(0, 10)}.md`, "text/markdown;charset=utf-8");
  }

  return <div className="main-content" style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 20, paddingBottom: 40 }}>
    <div>
      <h1 style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 22, margin: 0, color: "var(--color-text-primary)" }}>
        <Radar size={20} /> {t("crawlerTitle")}
      </h1>
      <p style={{ ...hint, marginTop: 6, maxWidth: 820 }}>{t("crawlerSubtitle")}</p>
    </div>

    {notMigrated && <div className="panel" style={{ color: "var(--color-accent-orange)" }}>
      <AlertTriangle size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{t("crawlerNotMigrated")}
    </div>}

    <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Search size={16} color="var(--color-text-tertiary)" />
      <input
        className="tool-input" style={{ flex: 1, minWidth: 240 }} value={target}
        onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === "Enter" && scan()}
        placeholder="competitor.com"
      />
      <button onClick={scan} disabled={busy || !target.trim()} style={primary}>
        {busy ? <Loader2 className="spin" size={14} /> : <Radar size={14} />} {t("crawlerRun")}
      </button>
    </div>

    {error && <div className="panel" style={{ borderColor: "rgba(255,69,58,.35)", color: "#ff6b62", fontSize: 13 }}>
      {t(`crawlerError_${error}` as TKey) !== `crawlerError_${error}` ? t(`crawlerError_${error}` as TKey) : `${t("crawlerFailed")}: ${error}`}
    </div>}

    <div className="crawler-grid">
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border)", fontSize: 13, fontWeight: 700 }}>
          {t("crawlerHistory")} · {scans.length}
        </div>
        {!scans.length && <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>{t("crawlerNoScans")}</div>}
        {visibleScans.map(item => <div key={item.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)" }}>
          <button onClick={() => open(item.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", border: 0, background: item.id === current?.id ? "rgba(41,151,255,.07)" : "transparent", color: "var(--color-text-primary)", padding: "11px 14px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {item.status === "completed" ? <CheckCircle2 size={13} color={scoreColor(item.score ?? 0)} /> : <XCircle size={13} color="#ff453a" />}
              <b style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{item.host}</b>
              {item.score != null && <span style={{ color: scoreColor(item.score), fontWeight: 800, fontSize: 12 }}>{item.score}</span>}
            </div>
            <small style={{ display: "block", marginTop: 3, color: "var(--color-text-tertiary)" }}>{new Date(item.createdAt).toLocaleString()}</small>
          </button>
          <button onClick={() => remove(item.id)} title={t("crawlerDelete")} style={{ border: 0, background: "transparent", color: "var(--color-text-tertiary)", padding: "0 10px", cursor: "pointer" }}><Trash2 size={13} /></button>
        </div>)}
        {scans.length > PAGE_SIZE && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", fontSize: 11, color: "var(--color-text-secondary)" }}>
          <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} style={pager(safePage === 0)}>←</button>
          <span>{safePage + 1} / {pageCount}</span>
          <button onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} style={pager(safePage >= pageCount - 1)}>→</button>
        </div>}
      </div>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {!report ? <div className="panel" style={{ padding: 34, textAlign: "center", color: "var(--color-text-secondary)" }}>{t("crawlerSelect")}</div> : <>
          <div className="panel" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 68, height: 68, borderRadius: "50%", display: "grid", placeItems: "center", border: `4px solid ${scoreColor(report.score)}`, color: scoreColor(report.score), fontSize: 21, fontWeight: 850 }}>{report.score}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{report.host}</h2>
              <a href={report.finalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--color-accent-blue)" }}>{report.finalUrl}</a>
              <div style={{ ...hint, marginTop: 5 }}>
                HTTP {report.httpStatus} · {report.https ? "HTTPS" : "HTTP"} · {report.loadMs} ms · {Math.round(report.bytes / 1024)} KB
                {report.redirected && ` · ${t("crawlerRedirected")}`}
              </div>
            </div>
            <button onClick={exportMarkdown} style={ghostLarge}><Download size={14} /> {t("crawlerExportMd")}</button>
          </div>

          <div className="panel">
            <h3 style={sectionTitle}><BarChart3 size={15} /> {t("crawlerMetrics")}</h3>
            {metrics ? <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8, fontSize: 13 }}>
              <Metric label="DR" value={metrics.dr ?? metrics.domainRating} />
              <Metric label={t("crawlerRefDomains")} value={metrics.refDomains ?? metrics.referringDomains} />
              <Metric label={t("crawlerBacklinks")} value={metrics.backlinks} />
              <Metric label={t("crawlerTraffic")} value={metrics.traffic ?? metrics.organicTraffic} />
              {metrics.checkedAt && <span style={{ ...hint, alignSelf: "center" }}>{new Date(metrics.checkedAt).toLocaleDateString()}</span>}
            </div> : <p style={hint}>{t("crawlerMetricsEmpty")}</p>}
            <p style={{ ...hint, marginTop: 8 }}>{t("crawlerMetricsCost")}</p>
            {metricsNote && <p style={{ ...hint, color: "var(--color-accent-orange)" }}>
              {t(`crawlerMetrics_${metricsNote}` as TKey) !== `crawlerMetrics_${metricsNote}` ? t(`crawlerMetrics_${metricsNote}` as TKey) : metricsNote}
            </p>}
            <button
              style={{ ...ghostLarge, marginTop: 8 }} disabled={metricsBusy}
              onClick={() => report && window.confirm(t("crawlerMetricsConfirm")) && loadMetrics(report.host, true)}
            >
              {metricsBusy ? <Loader2 className="spin" size={14} /> : <BarChart3 size={14} />} {t("crawlerMetricsFetch")}
            </button>
          </div>

          {/* Ads Intelligence — optional, collapsed by default. The metrics panel answers how
              strong the domain is organically; this one shows what and how it advertises: which
              advertisers run Google Ads for it, with what copy and creatives, in which countries,
              and who else buys ads around its keywords. The keyword search is domain-independent
              and is the competitive map of the niche. */}
          <div className="panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}><Megaphone size={15} /> {t("adsTitle")}</h3>
              <button style={ghost} onClick={() => setAdsOpen(o => !o)}>
                {adsOpen ? t("crawlerAdsHide") : t("crawlerAdsOpen")}
              </button>
            </div>
            <p style={{ ...hint, marginTop: 6 }}>{t("adsSub")}</p>
            {adsOpen && <div style={{ marginTop: 12 }}><AdsIntelTab domain={report.host} /></div>}
          </div>

          {current?.related?.length ? <div className="panel">
            <h3 style={sectionTitle}><Fingerprint size={15} /> {t("crawlerRelated")} · {current.related.length}</h3>
            <p style={hint}>{t("crawlerRelatedHint")}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
              {current.related.map(item => <div key={item.scanId} style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", padding: "8px 10px", borderRadius: 8, background: item.strength === "strong" ? "rgba(255,69,58,.08)" : "var(--color-bg)", border: `1px solid ${item.strength === "strong" ? "rgba(255,69,58,.25)" : "var(--color-border)"}` }}>
                <b style={{ fontSize: 12 }}>{item.host}</b>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: item.strength === "strong" ? "#ff6b62" : "var(--color-text-tertiary)" }}>
                  {t(item.strength === "strong" ? "crawlerStrong" : "crawlerWeak")}
                </span>
                <span style={{ flex: 1, minWidth: 180, fontSize: 11, color: "var(--color-text-secondary)" }}>{item.matches.join(" · ")}</span>
                <button onClick={() => open(item.scanId)} style={ghost}>{t("crawlerOpen")}</button>
              </div>)}
            </div>
          </div> : null}

          {report.cloaking && <div className="panel" style={report.cloaking.verdict === "cloaking" ? { borderColor: "rgba(255,69,58,.4)" } : report.cloaking.verdict === "suspicious" ? { borderColor: "rgba(255,159,10,.4)" } : undefined}>
            <h3 style={sectionTitle}><Eye size={15} /> {t("crawlerCloaking")}</h3>
            <p style={hint}>{t("crawlerCloakingHint")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0" }}>
              <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                color: report.cloaking.verdict === "cloaking" ? "#ff453a" : report.cloaking.verdict === "suspicious" ? "#ff9f0a" : "#34c759",
                background: report.cloaking.verdict === "cloaking" ? "rgba(255,69,58,.1)" : report.cloaking.verdict === "suspicious" ? "rgba(255,159,10,.1)" : "rgba(52,199,89,.1)" }}>
                {t(`crawlerCloak_${report.cloaking.verdict}`)}
              </span>
              {report.cloaking.googlebot.blocked && <span style={{ fontSize: 11, color: "var(--color-accent-orange)" }}>{t("crawlerGooglebotBlocked")}</span>}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ color: "var(--color-text-tertiary)", textAlign: "left" }}>
                <th style={cell}> </th><th style={cell}>Googlebot</th><th style={cell}>{t("crawlerBrowser")}</th>
              </tr></thead>
              <tbody>
                <tr><td style={cell}>HTTP</td><td style={cell}>{report.cloaking.googlebot.status}</td><td style={cell}>{report.cloaking.browser.status}</td></tr>
                <tr><td style={cell}>URL</td><td style={cell}>{report.cloaking.googlebot.finalUrl}</td><td style={cell}>{report.cloaking.browser.finalUrl}</td></tr>
                <tr><td style={cell}>Title</td><td style={cell}>{report.cloaking.googlebot.title || "—"}</td><td style={cell}>{report.cloaking.browser.title || "—"}</td></tr>
                <tr><td style={cell}>{t("crawlerWords")}</td><td style={cell}>{report.cloaking.googlebot.words}</td><td style={cell}>{report.cloaking.browser.words}</td></tr>
                <tr><td style={cell}>{t("crawlerIndexable")}</td><td style={cell}>{report.cloaking.googlebot.indexable ? "✓" : "—"}</td><td style={cell}>{report.cloaking.browser.indexable ? "✓" : "—"}</td></tr>
              </tbody>
            </table>
            {report.cloaking.flags.length > 0 && <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              {report.cloaking.flags.map(flag => <li key={flag}>{flag}</li>)}
            </ul>}
            {report.cloaking.redirectChain.length > 1 && <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-tertiary)", overflowWrap: "anywhere" }}>
              {t("crawlerChain")}: {report.cloaking.redirectChain.join("  →  ")}
            </div>}
          </div>}

          <div className="panel">
            <h3 style={sectionTitle}><ShieldAlert size={15} /> {t("crawlerFindings")} · {report.findings.length}</h3>
            {!report.findings.length ? <p style={{ ...hint, color: "var(--color-accent-green)" }}>{t("crawlerNoFindings")}</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                {report.findings.map((f, i) => {
                  const color = f.severity === "critical" ? "#ff453a" : f.severity === "warning" ? "#ff9f0a" : "#64d2ff";
                  return <div key={`${f.id}-${i}`} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 11px", borderRadius: 8, border: `1px solid ${color}30`, background: `${color}0a` }}>
                    {f.severity === "critical" ? <XCircle size={14} color={color} style={{ marginTop: 1 }} /> : f.severity === "warning" ? <AlertTriangle size={14} color={color} style={{ marginTop: 1 }} /> : <Info size={14} color={color} style={{ marginTop: 1 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 12 }}>{t((ISSUE_KEYS[f.id] ?? f.id) as TKey)}</b>
                      {f.evidence && <small style={{ display: "block", color: "var(--color-text-secondary)", marginTop: 2, overflowWrap: "anywhere" }}>{f.evidence}</small>}
                    </span>
                  </div>;
                })}
              </div>}
          </div>

          <div className="crawler-cards">
            <Card icon={<Layers size={15} />} title={t("crawlerPlatform")} rows={[
              [t("crawlerCms"), report.platform.cms ?? "—"],
              [t("crawlerFramework"), report.platform.framework ?? "—"],
              ["Generator", report.platform.generator ?? "—"],
              ["Server", report.platform.server ?? "—"],
              [t("crawlerStack"), report.platform.hints.join(", ") || "—"],
              ...(report.platform.wordpress ? [
                [t("crawlerWpTheme"), report.platform.wordpress.themes.join(", ") || "—"],
                [t("crawlerWpPlugins"), report.platform.wordpress.plugins.length ? `${report.platform.wordpress.plugins.length}: ${report.platform.wordpress.plugins.slice(0, 8).join(", ")}` : "—"],
                [t("crawlerWpUsers"), report.platform.wordpress.restUsers.join(", ") || "—"],
              ] as [string, string][] : []),
            ]} />
            <Card icon={<Server size={15} />} title={t("crawlerInfra")} rows={[
              ["IP", report.infra.ips.join(", ") || "—"],
              ["NS", report.infra.nameservers.join(", ") || "—"],
              ["MX", report.infra.mx.join(", ") || "—"],
              ["CDN", report.infra.cdn ?? "—"],
            ]} />
            <Card icon={<Globe2 size={15} />} title={t("crawlerScale")} rows={[
              [t("crawlerSitemapUrls"), report.scale.sitemapUrls == null ? "—" : String(report.scale.sitemapUrls)],
              ["Sitemap", report.scale.sitemaps[0] ?? "—"],
              [t("crawlerLanguages"), report.scale.languages.join(", ") || "—"],
              ["robots.txt", report.ai.robotsTxt ? "✓" : "—"],
              ["llms.txt", report.ai.llmsTxt ? "✓" : "—"],
              [t("crawlerBlockedBots"), report.ai.blockedBots.join(", ") || "—"],
            ]} />
            <Card icon={<Info size={15} />} title={t("crawlerPage")} rows={[
              ["Title", `${report.facts.title || "—"} (${report.facts.titleLength})`],
              ["Description", report.facts.metaDescription || "—"],
              ["H1", String(report.facts.h1Count)],
              [t("crawlerWords"), String(report.facts.wordCount)],
              ["Canonical", report.facts.canonical ?? "—"],
              ["JSON-LD", String(report.facts.schemaBlocks)],
              [t("crawlerIndexable"), report.facts.indexable == null ? "—" : report.facts.indexable ? "✓" : "noindex"],
            ]} />
          </div>
        </>}
      </div>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <span style={{ display: "flex", flexDirection: "column" }}>
    <b style={{ fontSize: 17 }}>{value == null || value === "" ? "—" : String(value)}</b>
    <small style={{ color: "var(--color-text-tertiary)" }}>{label}</small>
  </span>;
}

function Card({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: [string, string][] }) {
  return <div className="panel" style={{ minWidth: 0 }}>
    <h3 style={sectionTitle}>{icon} {title}</h3>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
      <tbody>
        {rows.map(([label, value]) => <tr key={label}>
          <td style={{ padding: "6px 8px 6px 0", color: "var(--color-text-tertiary)", whiteSpace: "nowrap", verticalAlign: "top", borderBottom: "1px solid var(--color-border)" }}>{label}</td>
          <td className="privacy-sensitive" style={{ padding: "6px 0", overflowWrap: "anywhere", borderBottom: "1px solid var(--color-border)" }}>{value}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

const ISSUE_KEYS: Record<string, string> = {
  https_unavailable: "publicCheckHttpsUnavailable", robots_txt_missing: "crawlerIssueRobotsMissing",
  sitemap_missing: "crawlerIssueSitemapMissing", wp_users_exposed: "crawlerIssueWpUsers",
  cloaking_detected: "crawlerIssueCloaking", cloaking_suspected: "crawlerIssueCloakSuspect",
  googlebot_blocked: "crawlerIssueGbBlocked",
  wp_xmlrpc_open: "crawlerIssueXmlrpc", wp_readme_public: "crawlerIssueReadme",
  http_error: "auditIssueHttpError", redirect: "auditIssueRedirect", redirect_chain: "auditIssueRedirectChain",
  title_missing: "auditIssueTitleMissing", title_too_long: "auditIssueTitleTooLong", title_too_short: "auditIssueTitleTooShort",
  description_missing: "auditIssueDescriptionMissing", description_too_long: "auditIssueDescriptionTooLong", description_too_short: "auditIssueDescriptionTooShort",
  h1_missing: "auditIssueH1Missing", h1_multiple: "auditIssueH1Multiple", noindex: "auditIssueNoindex",
  robots_conflict: "auditIssueRobotsConflict", canonical_missing: "auditIssueCanonicalMissing",
  canonical_invalid: "auditIssueCanonicalInvalid", canonical_mismatch: "auditIssueCanonicalMismatch",
  thin_content: "auditIssueThinContent", images_no_alt: "auditIssueImagesNoAlt",
  slow_response: "auditIssueSlowResponse", viewport_missing: "auditIssueViewportMissing",
  lang_missing: "auditIssueLangMissing", jsonld_invalid: "auditIssueJsonLdInvalid",
  organization_schema_incomplete: "auditIssueOrganizationSchemaIncomplete",
  open_graph_incomplete: "auditIssueOpenGraphIncomplete", twitter_card_incomplete: "auditIssueTwitterCardIncomplete",
  mixed_content: "auditIssueMixedContent", security_headers_missing: "auditIssueSecurityHeadersMissing",
};

function scoreColor(score: number) { return score >= 85 ? "#34c759" : score >= 65 ? "#ff9f0a" : "#ff453a"; }
const hint: React.CSSProperties = { fontSize: 12, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 };
const sectionTitle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: "var(--color-text-primary)" };
const primary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: 0, background: "var(--color-accent-blue)", color: "#fff", fontSize: 13, fontWeight: 650, cursor: "pointer" };
const ghost: React.CSSProperties = { padding: "5px 9px", borderRadius: 7, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: 11, cursor: "pointer" };
const cell: React.CSSProperties = { padding: "6px 10px 6px 0", borderBottom: "1px solid var(--color-border)", overflowWrap: "anywhere", verticalAlign: "top" };
const ghostLarge: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 9, border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: 12, fontWeight: 650, cursor: "pointer" };
const pager = (disabled: boolean): React.CSSProperties => ({ padding: "4px 9px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-card)", color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-secondary)", cursor: disabled ? "default" : "pointer" });
