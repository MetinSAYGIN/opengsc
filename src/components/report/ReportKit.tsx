"use client";

// Small shared pieces for the GSC report tables (Striking distance, Cannibalization): paging,
// the data-window line, CSV download, and the button/select vocabulary the Decay table uses.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export const chipBtn = (active: boolean, color = "#3B82F6"): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999,
  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${active ? color : "var(--color-border)"}`,
  background: active ? `${color}1a` : "transparent",
  color: active ? color : "var(--color-text-secondary)",
});

export const selectStyle: React.CSSProperties = {
  padding: "5px 8px", borderRadius: 7, fontSize: 12, border: "1px solid var(--color-border)",
  background: "var(--color-card)", color: "var(--color-text-primary)", cursor: "pointer", outline: "none",
};

export const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7,
  border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)",
  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};

export const PAGE_SIZES = [10, 25, 50, 100];

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file-name-safe slug for a CSV. */
export const fileSlug = (s: string) => s.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 60) || "report";

export function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export interface DataWindow { start: string; end: string; days: number }

/**
 * Which dates the numbers cover. These reports read one 90-day total per query+page pair, stored
 * at each sync — so the window is a fact about the data, not a choice, and it is stated as one.
 */
export function WindowNote({ window, mixed }: { window: DataWindow | null | undefined; mixed?: boolean }) {
  const { t } = useLanguage();
  if (!window) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
      {t("rptWindow")
        .replace("{days}", String(window.days))
        .replace("{range}", `${fmtDay(window.start)} – ${fmtDay(window.end)}`)}
      {mixed && <span style={{ color: "var(--color-text-tertiary)" }}> · {t("rptWindowMixed")}</span>}
    </div>
  );
}

export function Pager({ page, pageCount, pageSize, total, shown, onPage, onPageSize, unit }: {
  page: number; pageCount: number; pageSize: number; total: number; shown: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
  /** e.g. "keywords" — appended to the range. */
  unit?: string;
}) {
  const { t } = useLanguage();
  const start = total ? page * pageSize + 1 : 0;
  return (
    <div style={{
      padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      background: "var(--color-bg)", borderTop: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-secondary)",
    }}>
      <span>
        {t("rptRange").replace("{start}", start.toLocaleString()).replace("{end}", (page * pageSize + shown).toLocaleString()).replace("{total}", total.toLocaleString())}
        {unit ? ` ${unit}` : ""}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{t("cdmRowsPerPage")}</span>
        <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))} style={selectStyle}>
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" aria-label={t("prev")} onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}
          style={{ ...ghostBtn, padding: "4px 6px", opacity: page === 0 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{page + 1} / {pageCount}</span>
        <button type="button" aria-label={t("cdmNext")} onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}
          style={{ ...ghostBtn, padding: "4px 6px", opacity: page >= pageCount - 1 ? 0.4 : 1 }}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

/** A stable string key for an id list prop (arrays are new on every render). */
export const idsKey = (ids: string[] | null | undefined) => (ids?.length ? [...ids].sort().join(",") : "");
