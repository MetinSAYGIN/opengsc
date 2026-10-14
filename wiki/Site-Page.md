# Site Page

Click any site on the dashboard to open its page. The tabs along the top are kept in the URL (`?tab=…`), so you can link straight to one.

| Tab | What it's for | Needs |
|---|---|---|
| **Dashboard** | Clicks, impressions, CTR, position over time; top queries, pages, countries, devices; new rankings. Engine switcher **G / Bing / Я** for live Bing and Yandex views | GSC (Bing/Yandex optional) |
| **Positions** | [Rank Tracker](Rank-Tracker): tracked keywords, local pack, history | SERP provider |
| **Visibility** | [AI Visibility](AI-Visibility): AI answers, LLM Mentions, share of voice, brand mentions, Yandex AI | AI keys / DataForSEO (mentions are free) |
| **GA4** | Sessions, engagement, key events, revenue | [GA4 setup](Google-Cloud-Setup#google-analytics-4) |
| **Indexing** | [Indexing](Indexing): sitemap inventory, URL Inspection, automatic index checks, IndexNow, Bing/Yandex actions, `site:` estimates | GSC (accelerators optional) |
| **Backlinks** | [Backlinks](Backlinks): your link inventory, referring-domain profile, toxicity, disavow | Metrics provider or CSV import |
| **Annotations** | Notes on the traffic timeline ("migrated to new theme", "bought links") with before/after numbers | — |
| **Optimize** | Content Decay map, Keyword Cannibalization, Striking Distance, CTR Benchmark for this site | GSC |
| **Health** | SSL, Safe Browsing, VirusTotal, Core Web Vitals, uptime history | [Health keys](Site-Audit-Health-Uptime#health-check-keys) |
| **Audit** | [Site Audit](Site-Audit-Health-Uptime#site-audit): built-in crawler, health score, issue table, history, Markdown export | — |
| **UX / Clarity** | Microsoft Clarity behaviour data | [Clarity token](Google-Cloud-Setup#microsoft-clarity) |
| **Settings** | Site context, branded keywords, content groups, public link (see below) | — |

## Dashboard tab

- The same period and comparison controls as the main dashboard.
- **Engine switcher** (G | Bing | Я next to the chart toolbar): a full live view per engine. Bing shows clicks, impressions, CTR, weighted average position, top queries, top pages, pages in index and crawl errors. Yandex shows SQI (ИКС), pages in search / excluded, clicks and impressions, top queries and Yandex's own site diagnostics. Positions for Bing/Yandex are marked **≈**: neither engine exposes a daily sitewide position, so OpenGSC computes an impression-weighted average of the top queries.
- Annotations and Magic-links purchases appear as markers on the traffic chart.

## Annotations

Add a dated note to the site's timeline. Each annotation shows before/after figures from your own Search Console data, so "did that change help?" gets a numeric answer. Link purchases from [Magic links](Publishing-and-Magic-Links) show up here automatically as purple markers.

## Settings tab

| Section | What it does |
|---|---|
| **Site context** | The site's "project memory" for AI tools and MCP agents: business, goal, positioning, competitors, key pages, research log. Agents read it with `get_site_context` and update it with `update_site_context` |
| **Branded keywords** | Brand terms, used to split branded from non-branded traffic |
| **Content groups / Topic clusters** | Group URLs (by pattern or with AI clustering) and see aggregate performance per group |
| **Public link** | Generates a tokenized read-only URL (`/share/…`) of this one site's analytics for a client. Regenerate or revoke at any time. Guests see nothing else. |
| **Import metrics** | Upload an Ahrefs/Semrush export for this site (e.g. referring domains) |

## Removing a site

Sites come from Search Console.

- A property removed or unverified in Search Console is **archived** automatically on the next sync. It leaves the dashboard, but its collected metrics, audits and keywords stay. If it comes back in Search Console, it's un-archived.
- To get a live site out of the way, **hide** it on the dashboard.
- **Deleting** a site (owner only) removes it together with all its metrics, audits, keywords, backlinks and snapshots. This can't be undone. If the property is still in a connected Google account, the next sync adds it back as a fresh site, so hide it instead if you only want it gone from view.
