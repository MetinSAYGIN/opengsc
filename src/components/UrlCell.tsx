"use client";

// A page URL in a narrow table cell (#28): the label is truncated, but the full URL is one hover
// (tooltip), one click (opens in a new tab) or one button (copied) away. Reviewing old URLs after
// a migration is exactly the job that needs all three.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * navigator.clipboard only exists in a secure context. Plenty of self-hosted instances are
 * reached over plain http on a LAN IP, where it is undefined — fall back to a hidden
 * textarea + execCommand, which still works there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Only http(s) becomes a link — a stored value that is anything else is shown as text. */
export function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

export default function UrlCell({ label, href, fontSize = 13, color = "#3B82F6" }: {
  label: string; href: string; fontSize?: number; color?: string;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const text: React.CSSProperties = {
    color, fontWeight: 500, fontSize, minWidth: 0,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };
  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: 20, height: 20, padding: 0, borderRadius: 5, border: "none", background: "transparent",
    color: "var(--color-text-tertiary)", cursor: "pointer", textDecoration: "none",
  };

  const linkable = isHttpUrl(href);
  return (
    <span className="url-cell" style={{ display: "inline-flex", alignItems: "center", gap: 2, minWidth: 0, maxWidth: "100%" }}>
      {linkable ? (
        <a href={href} target="_blank" rel="noopener noreferrer" title={href}
          onClick={e => e.stopPropagation()}
          style={{ ...text, textDecoration: "none" }}>
          {label}
        </a>
      ) : (
        <span style={text} title={href}>{label}</span>
      )}
      {linkable && (
        <a href={href} target="_blank" rel="noopener noreferrer" title={t("cdmOpenUrl")} aria-label={t("cdmOpenUrl")}
          onClick={e => e.stopPropagation()} style={iconBtn}>
          <ExternalLink size={12} />
        </a>
      )}
      <button type="button" title={copied ? t("cdmUrlCopied") : t("cdmCopyUrl")} aria-label={t("cdmCopyUrl")}
        onClick={async e => { e.stopPropagation(); if (await copyText(href)) setCopied(true); }}
        style={{ ...iconBtn, color: copied ? "#10B981" : iconBtn.color }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
