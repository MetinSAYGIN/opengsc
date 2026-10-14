# Dashboard

The home screen (`/`) shows every site from every connected Google account in one portfolio.

## The top bar

| Item | What it opens |
|---|---|
| **Dashboard** | This screen |
| **Analytics** → Potential, Cannibalization, Decay, Audits | Portfolio-wide reports. See [Portfolio Analytics](Portfolio-Analytics) |
| **SEO Tools** | The AI content suite and research tools. See [SEO Tools](SEO-Tools) |
| **Monitoring** → Indexer, SERP Monitor, Digest | [Indexer Network](Indexer-Network), [SERP Monitor](SERP-Monitor), [Digests](Notifications#digests) |
| **Research** → Crawler, Drops, Magic links, Publishing, A-Parser | Tools that look *outward* at sites and domains you don't own (A-Parser appears only once it's configured) |
| **Clients** → Reports, Leads | [Client Reports, Leads and Sharing](Reports-Leads-Sharing) |
| User menu | Settings, dark mode, layout width, Privacy Blur, feedback; the running **version** is shown at the bottom |

When a new version is available, the owner sees an update bar above everything. See [Updating](Updating-and-Backups).

## Engines: Google · Bing · Yandex

Tabs at the top switch the **whole portfolio** between search engines.

- **Google** reads from your local database, filled by the Search Console sync.
- **Bing** and **Yandex** are pulled live from their webmaster APIs across every connected account, and list *their own* verified sites (not just the ones you have in Google). Results are cached on the server, so after the first build a tab opens instantly. These tabs appear once a Bing key / Yandex token is configured. See [Indexing](Indexing#bing-webmaster-and-yandexwebmaster).

**Sync Data** refreshes all three engines at once.

## Periods and comparison

- Quick ranges: **7d / 28d / 3m / 6m / 12m / 16m**, or a custom range.
- Comparison: previous period, year over year, or a custom range.
- Metric toggles: **Clicks, Impressions, CTR, Position**. The summary row aggregates every visible site and recalculates when you filter by tag.
- The period is kept in the URL, so a reload or a shared link opens the same view.

Search Console data arrives about two days late. The latest complete day is normally the day before yesterday, and comparisons are built over complete days only.

## Organizing many sites

- **Tags**: group sites (clients, networks, niches) and filter the dashboard, digests and reports by tag.
- **Favorites**: pin important projects to the top.
- **Hide**: remove dead or irrelevant sites from the list (survives reloads, can be undone).
- **Sort**: by any metric. Your last sort order is remembered.
- **Search** by domain.
- **Right-click → open in new tab** works on any site card.

## What each site card shows

- A sparkline of the selected metric and the period totals with deltas.
- An **uptime dot**: online / slow / offline. Offline sites float into a **"Needs attention"** group above the rest. A status filter narrows the list. See [Uptime](Site-Audit-Health-Uptime#uptime-monitor).
- **Ahrefs DR** badge: Domain Rating from Ahrefs' free public endpoint, cached for 7 days. No key needed.
- **Site-search badge**: opens a `site:domain.com` search for a quick manual index check. It follows the active engine (**G** Google, **b** Bing, **Я** Yandex).

## Portfolio reports on the dashboard

Striking distance, cannibalization and content decay are available across the whole network, not just per site. See [Portfolio Analytics](Portfolio-Analytics).

## Privacy Blur and export

- **Privacy Blur** (user menu) blurs every account name, e-mail, domain and number with one click, so you can screen-share or take screenshots safely.
- **CSV export** with selectable dimensions.

## Keeping data fresh

- **Sync Data** pulls new data on demand (30 recent days first for every site, then up to 16 months of history).
- **Settings → Sync → Sync automatically every day** schedules it at a chosen hour in your time zone. **It's off by default.**

## No sites showing?

1. **Settings → My Google Accounts**: is an account connected and does it show **GSC ✓**?
2. Does that Google account actually have the properties? Check [search.google.com/search-console](https://search.google.com/search-console).
3. Press **Sync Data** and watch `pm2 logs opengsc` for `[GSC Sync]` lines.
4. Accounts disconnecting every 7 days → [Google Cloud Setup → Testing vs. In production](Google-Cloud-Setup#testing-vs-in-production-read-this).
