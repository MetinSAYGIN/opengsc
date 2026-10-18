# Portfolio Analytics

Four analyses that the stock Search Console UI doesn't give you. Each one exists for a single site (site → **Optimize** tab) and across the whole portfolio (top menu → **Analytics**). All four read your local Search Console data: free and instant.

## Potential (Striking Distance)

**Top menu → Analytics → Potential**, or site → Optimize → Striking Distance.

Query + page pairs ranking at **positions 4–20** with real impressions: the fastest wins to the top of page one. Rows are ordered by the estimated extra clicks the page would get at position #3.

- With a metrics provider (or an imported CSV) you can press **Load weights** to add **Volume**, **KD** and a **Potential** column: roughly what the keyword could bring near the top of page one minus what it brings now. Impressions are demand filtered through your current visibility; volume is the market itself. KD is an opt-in checkbox because it roughly doubles the cost on Ahrefs. See [SEO Metrics Providers](SEO-Metrics-Providers).
- A **Buy** button on each row opens [Magic links](Publishing-and-Magic-Links#magic-links) with the query and URL pre-filled. Already-bought pairs are marked.

## Cannibalization

Two modes:

- **Exact query**: the same query split between several of your URLs, with a winner and losers.
- **Related intent**: different formulations of the same intent splitting visibility across your pages. It explains ranking-URL overlap, page roles, position gaps and daily winner changes (last 28 days of per-day data).

Both modes **suggest what to review**. Nothing is merged, canonicalized or redirected automatically.

## Content Decay

Pages whose traffic is trending down, compared over **two equal complete windows** (56 or 14 days, ignoring the newest provisional days):

| Label | Meaning |
|---|---|
| **Lost** | traffic went to zero |
| **Critical** | down more than 25% |
| **Warning** | down more than 5% |

A heatmap shows the decay over time. URLs are clickable and copyable. Per page:

- **Demand** checks the page's top query on request (needs a metrics provider). Clicks falling while demand is flat is a ranking problem. Clicks falling *with* demand is the market, and no rewrite fixes that.
- **Rewrite** opens the [Content Rewriter](SEO-Tools#rewrite-content-rewriter) with the URL pre-filled.

## CTR Benchmark

Your real CTR against expected CTR curves by position. Queries in the top 10 whose CTR trails the benchmark point at a **snippet** problem (title, description, rich results), not a content problem. These are the cheapest clicks to win.

## Audits

**Top menu → Analytics → Audits**: every site-audit run across the workspace in one history, with pages, issue counts, health score and regression verdict per row. Filter by site, status or date; sort by issues or regressions. **Never-audited sites are listed explicitly.** Each row opens that site's Audit tab. Runs can be shared as public, `noindex` Markdown links.

See [Site Audit](Site-Audit-Health-Uptime#site-audit).

## Digest

**Top menu → Monitoring → Digest**: a portfolio report over all sites or one tag (KPIs, gainers and losers, rising and falling queries, striking-distance queries, sites needing attention, rank movements). Split by Google / Bing / Yandex, with an optional AI conclusion and scheduled delivery. See [Notifications → Digests](Notifications#digests).

## Ask an agent instead

Every report above is also an MCP tool (`get_striking_distance`, `get_cannibalization`, `get_content_decay`, `get_ctr_benchmark`, `get_optimization_brief`). An agent like Claude Code can turn them into a prioritized plan and draft the fixes. See [MCP Server](MCP-Server).
