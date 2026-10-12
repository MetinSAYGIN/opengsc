"use client";

// Portfolio site picker for the GSC reports (Decay, Striking distance, Cannibalization). Built for
// portfolios of hundreds to thousands of sites: searchable, filterable by tag, and every site
// carries its own findings and a headline figure, so "which of my 800 sites needs work" is
// answered by the list order before anything is selected. The figures come from the server over
// ALL sites (not just the selected ones), so they stay meaningful while a filter is on.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Globe, Search, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export interface SiteOption {
  siteId: string;
  siteName: string;
  tags: string[];
  /** Has findings — drives "only sites with findings". */
  active: boolean;
  /** Default order, largest first. */
  weight: number;
  /** The right-aligned headline number. */
  figure: string;
  figureColor?: string;
  badges: { n: number; color: string; title: string }[];
}

export interface SitePickerLabels {
  /** "Only sites with declining pages" */
  onlyActive: string;
  /** "Biggest loss" — the default sort's name */
  sortWeight: string;
  /** Shown under a site with no findings: "nothing declining" */
  none: string;
}

/** Rendering a thousand rows is fine; ten thousand DOM nodes of them is not worth it. */
const RENDER_CAP = 300;

export default function SitePicker({ sites, selected, onChange, labels }: {
  sites: SiteOption[];
  labels: SitePickerLabels;
  /** null = every site. */
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [onlyDeclining, setOnlyDeclining] = useState(true);
  const [byName, setByName] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const sel = useMemo(() => new Set(selected ?? []), [selected]);
  const byId = useMemo(() => new Map(sites.map(s => [s.siteId, s])), [sites]);

  const tags = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of sites) for (const tg of s.tags) c.set(tg, (c.get(tg) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);
  }, [sites]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = sites.filter(s =>
      (!needle || s.siteName.toLowerCase().includes(needle)) &&
      (!tag || s.tags.includes(tag)) &&
      // A selected site never disappears from the list just because it has nothing flagged.
      (!onlyDeclining || s.active || sel.has(s.siteId)),
    );
    return byName
      ? [...list].sort((a, b) => a.siteName.localeCompare(b.siteName))
      : [...list].sort((a, b) => b.weight - a.weight || a.siteName.localeCompare(b.siteName));
  }, [sites, q, tag, onlyDeclining, byName, sel]);

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next.size ? [...next] : null);
  };
  const selectShown = () => {
    const next = new Set(sel);
    for (const s of shown) next.add(s.siteId);
    onChange(next.size ? [...next] : null);
  };

  const label = !selected?.length
    ? t("cdmSitesAll").replace("{n}", sites.length.toLocaleString())
    : selected.length === 1
      ? (byId.get(selected[0])?.siteName ?? "1")
      : t("cdmSitesSelected").replace("{n}", selected.length.toLocaleString()).replace("{total}", sites.length.toLocaleString());

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? "#3B82F6" : "var(--color-border)"}`,
    background: active ? "rgba(59,130,246,0.12)" : "transparent",
    color: active ? "#3B82F6" : "var(--color-text-secondary)",
  });
  const count = (n: number, color: string, title: string) => n > 0 && (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />{n.toLocaleString()}
    </span>
  );

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 7, maxWidth: 280,
          border: `1px solid ${selected?.length ? "#3B82F6" : "var(--color-border)"}`,
          background: selected?.length ? "rgba(59,130,246,0.1)" : "var(--color-card)",
          color: selected?.length ? "#3B82F6" : "var(--color-text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
        <Globe size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>

      {open && (
        <div role="dialog" style={{
          position: "absolute", zIndex: 50, top: "calc(100% + 6px)", left: 0, width: "min(460px, calc(100vw - 32px))",
          background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: 520,
        }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t("cdmSiteSearch")}
                style={{ width: "100%", padding: "6px 10px 6px 28px", borderRadius: 7, fontSize: 12.5, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", outline: "none" }} />
            </label>
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {tags.map(([tg, n]) => (
                  <button key={tg} type="button" onClick={() => setTag(tag === tg ? null : tg)} style={chip(tag === tg)}>
                    #{tg} <span style={{ opacity: 0.7 }}>{n}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={onlyDeclining} onChange={e => setOnlyDeclining(e.target.checked)} />
                {labels.onlyActive}
              </label>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setByName(false)} style={chip(!byName)}>{labels.sortWeight}</button>
              <button type="button" onClick={() => setByName(true)} style={chip(byName)}>A–Z</button>
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {shown.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "var(--color-text-secondary)" }}>{t("cdmSitesNone")}</div>
            ) : shown.slice(0, RENDER_CAP).map(s => {
              const on = sel.has(s.siteId);
              return (
                <label key={s.siteId} style={{
                  display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto", alignItems: "center", gap: 8,
                  padding: "7px 12px", cursor: "pointer", fontSize: 12.5,
                  background: on ? "rgba(59,130,246,0.08)" : "transparent", borderBottom: "1px solid var(--color-border)",
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s.siteId)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-primary)", fontWeight: 500 }} title={s.siteName}>{s.siteName}</span>
                    <span style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {s.badges.map((b, i) => <span key={i}>{count(b.n, b.color, b.title)}</span>)}
                      {!s.active && <span>{labels.none}</span>}
                      {s.tags.length > 0 && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tags.map(x => `#${x}`).join(" ")}</span>}
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: s.active ? (s.figureColor ?? "var(--color-text-primary)") : "var(--color-text-tertiary)" }}>
                    {s.figure}
                  </span>
                </label>
              );
            })}
            {shown.length > RENDER_CAP && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>
                {t("cdmSitesMore").replace("{n}", (shown.length - RENDER_CAP).toLocaleString())}
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <button type="button" onClick={selectShown} disabled={!shown.length}
              style={{ ...chip(false), opacity: shown.length ? 1 : 0.5 }}>
              {t("cdmSitesSelectShown").replace("{n}", shown.length.toLocaleString())}
            </button>
            <button type="button" onClick={() => onChange(null)} disabled={!selected?.length}
              style={{ ...chip(false), opacity: selected?.length ? 1 : 0.5 }}>
              {t("cdmSitesClear")}
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setOpen(false)}
              style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#3B82F6", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {t("cdmSitesDone")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The selected sites as removable chips under the toolbar. */
export function SelectedSiteChips({ sites, selected, onChange }: {
  sites: { siteId: string; siteName: string }[]; selected: string[] | null; onChange: (next: string[] | null) => void;
}) {
  const { t } = useLanguage();
  if (!selected?.length) return null;
  const names = new Map(sites.map(s => [s.siteId, s.siteName]));
  const SHOW = 6;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
      {selected.slice(0, SHOW).map(id => (
        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.1)", color: "#3B82F6" }}>
          {names.get(id) ?? id}
          <button type="button" aria-label={t("cdmSitesClear")} onClick={() => { const n = selected.filter(x => x !== id); onChange(n.length ? n : null); }}
            style={{ display: "inline-flex", border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 1 }}>
            <X size={12} />
          </button>
        </span>
      ))}
      {selected.length > SHOW && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>+{(selected.length - SHOW).toLocaleString()}</span>}
      <button type="button" onClick={() => onChange(null)} style={{ border: "none", background: "transparent", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
        {t("cdmSitesClear")}
      </button>
    </div>
  );
}
