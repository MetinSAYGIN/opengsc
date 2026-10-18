# Client Reports, Leads and Sharing

Three ways to show work to people outside your workspace: **client reports** (frozen white-label snapshots), **share links** (a live read-only dashboard) and the **audit widget** that turns your agency site's visitors into **leads**.

## Client reports

**Top menu → Clients → Reports** (`/reports`).

### Building a report

Pick a site and a template, then toggle sections:

| Template | Sections |
|---|---|
| **Executive** | summary, traffic, queries, positions, work done |
| **Detailed** | executive + pages, indexing, backlinks, uptime |
| **Technical** | audit (with Core Web Vitals), indexing, uptime |
| **Local** | local positions (with NAP), reviews |

All sections: summary, traffic, queries, pages, positions, local positions, indexing, audit, uptime, backlinks, AI visibility, reviews, **work done** (your Markdown notes), next steps.

- **Summary and next steps are deterministic**: clicks vs. the previous period, the best query move, and the first priority the data shows (index losses > rank drops > audit criticals > lost links > uptime incidents). **No forecasts, no AI.**
- A section with no data shows a "no data" pill, **never a zero**.
- **Language per report**: the snapshot, PDF, client e-mail and share link speak the client's language, whatever your interface language.

### Branding

**Settings → Preferences → report branding**: company name, logo (PNG/SVG/JPEG ≤ 200 KB), accent colour, footer, website. "Powered by OpenGSC" is **off** by default, so reports are white-label.

### A sent report is a snapshot

Every send (**Send now** or the schedule) stores the fully rendered HTML, plus a **PDF** when the server has a headless browser (Playwright). That snapshot **never re-renders**: not when branding changes, not when data changes. The numbers a client got in September stay those numbers. Without a server browser, open the HTML and print to PDF from any browser.

### Delivery

- **Schedule**: weekly (day of week) or monthly (day 1–28) at **09:00 UTC**.
- **E-mail** uses the SMTP settings from **Settings → Notifications → E-mail**. The mail carries the client link rather than an attachment. Without SMTP, reports and snapshots still work; only mail is off (the run shows "SMTP not configured").
- **Client link** `/share/report/<token>`: opens exactly **this report's snapshots** and nothing else. Rotate or revoke it at any time.

## Share links (live read-only dashboard)

**Site → Settings → Public Link** creates `/share/<site>/<token>`: a live, read-only view of **one site's** analytics, without an account. Regenerate to invalidate the old link, or revoke it. It's a different token from report links; one can't open the other.

Pair it with **Privacy Blur** for screenshots.

## Audit widget and leads

An embeddable **"check your website"** form for your own (agency) site. The visitor types a domain, gets a score and the top problems, leaves an e-mail, and you get a **lead with the findings attached**.

### Embedding

**Settings → Integrations → Audit widget** → copy the embed code:

```html
<iframe src="https://YOUR-INSTANCE/embed/audit?key=wid_…"
        style="width:100%;height:640px;border:0" loading="lazy" title="SEO audit"></iframe>
```

- `?lang=xx` fixes the widget language; otherwise the visitor's browser language is used.
- Width 320–720 px; follows the visitor's light/dark theme.
- **Auto-height**: the widget posts `{type: "opengsc:widget:height", height}` to the parent; listen for it and set the iframe height.
- **Allowed origins**: restrict which sites may embed it (empty = anywhere, with a warning).
- **Cloudflare Turnstile**: set `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` in `.env`. Without them the widget works but can be spammed.

### What the visitor gets

A "lite" audit of the homepage plus up to 4 pages, using the **same rules** as the Site Audit: HTTPS and certificate, status and redirects, title/description lengths, H1, canonical, noindex, viewport, `lang`, JSON-LD, Open Graph, security headers, response time, broken links on the homepage, mixed content, thin content, images without alt.

### Safety

The widget faces anonymous internet visitors, so it sees **none** of your data: no GSC, no sites, no keys. Every fetch refuses private addresses. It's rate-limited (5 audits per hour and 20 per day per visitor, 200 per day per widget). IPs exist only as salted hashes in memory and are stored nowhere. A lead can only be created by a completed audit.

### Leads inbox

**Top menu → Clients → Leads** (`/leads`): filters, search, CSV export.

- Expand a lead to see every finding with evidence.
- **Write** opens a ready `mailto:` draft: greeting, the 3 worst problems in plain words, a call offer (or your own template).
- **Proposal** builds a commercial proposal from the findings: about you, what we found (with plain-language consequences), scope (you tick findings), pricing table, timeline, next step. It's branded with your report branding and printable to PDF. It's deterministic, with **no traffic or revenue promises** by design.
- **Make client** marks the lead as a client and opens Reports.
- New-lead notifications go out with event `lead`.

### Orbitra bridge

If you run the [Orbitra](https://orbitra.link) tracker: paste its URL and a write-scope API key into the **Orbitra tracker** card on `/leads` → *Test connection*. Each lead then gets a **→ campaign in Orbitra** button that creates one empty campaign for that lead.

## MCP

`list_reports`, `list_leads`. Both are free reads.
