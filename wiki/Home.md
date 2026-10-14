# OpenGSC Wiki

OpenGSC is a self-hosted Google Search Console dashboard. You install it on your own VPS, connect your Google accounts, and get every site from every account on one screen, plus rank tracking, AI-answer visibility, audits, backlinks, an AI content suite and an MCP server for AI agents.

This wiki is the user manual. It explains how to install OpenGSC, what each screen does, what each feature needs (keys, quotas, money) and what to do when something breaks.

> **Version covered:** 1.10.x (October 2026). The in-app **Update** button keeps you on the latest `main`. Release notes are in [CHANGELOG.md](https://github.com/fenjo26/OpenGSC/blob/main/CHANGELOG.md).

## New here? Start with these four pages

1. **[Quick Start](Quick-Start)**: from an empty VPS to a working dashboard in about 15 minutes.
2. **[Google Cloud Setup](Google-Cloud-Setup)**: the OAuth app OpenGSC needs. This is where most first installs go wrong.
3. **[First Login, Accounts and Team](First-Login-and-Team)**: who becomes the owner, passwords, adding Google accounts and inviting people.
4. **[What Needs What](What-Needs-What)**: one table listing which features work out of the box and which need an API key, a Google quota or credits.

## Install and run

| Page | What's in it |
|---|---|
| [Installation](Installation) | One-line installer, requirements, manual install, swap on small VPSes |
| [Docker](Docker) | Running with `docker compose`, volumes, reverse proxy |
| [Configuration Reference](Configuration-Reference) | Every environment variable in `.env` |
| [Updating and Backups](Updating-and-Backups) | The UI updater, `update.sh`, scheduled encrypted backups, restoring |

## Using OpenGSC

| Page | What's in it |
|---|---|
| [Dashboard](Dashboard) | The portfolio screen: Google / Bing / Yandex tabs, periods, tags, sync |
| [Site Page](Site-Page) | Every tab of a single site, and what it's for |
| [Portfolio Analytics](Portfolio-Analytics) | Potential (striking distance), Cannibalization, Decay, CTR benchmark, Audits |
| [Rank Tracker](Rank-Tracker) | Keyword positions, local pack, providers |
| [AI Visibility (AEO)](AI-Visibility) | Are ChatGPT, Perplexity, Claude, Gemini, Grok and AI Overviews citing you? |
| [Indexing](Indexing) | Sitemap inventory, automatic URL Inspection, IndexNow, Bing / Yandex |
| [Site Audit, Health and Uptime](Site-Audit-Health-Uptime) | The built-in crawler, SSL / Safe Browsing / CWV, uptime monitor |
| [Backlinks](Backlinks) | Your link inventory, backlink profiles, toxicity and disavow |
| [SEO Metrics Providers](SEO-Metrics-Providers) | Ahrefs, Semrush, Majestic, DataForSEO, Keys.so, CSV import, costs |
| [SEO Tools (AI Content Suite)](SEO-Tools) | Clustering, outlines, articles, rewriter, GEO audit, Googlebot View and more |
| [AI Providers and Models](AI-Providers-and-Models) | Which AI keys are supported and how per-task models work |
| [SERP Providers and A-Parser](SERP-Providers-and-A-Parser) | Serper, DataForSEO, ScrapingRobot, XMLRiver, Firecrawl, A-Parser |
| [SERP Monitor](SERP-Monitor) | Whole top-100 snapshots, storms, newcomer domains |
| [Drops](Drops) | The expired-domain funnel and reviving bought domains |
| [Local SEO](Local-SEO) | Business profile, NAP, LocalBusiness schema, GBP, geo-grid scans |
| [Notifications, Alerts and Digests](Notifications) | Telegram, Slack, Discord, Teams, e-mail, webhooks, web push |
| [Client Reports, Leads and Sharing](Reports-Leads-Sharing) | White-label reports, the audit widget, read-only share links |
| [Publishing and Magic Links](Publishing-and-Magic-Links) | Sending posts to WordPress; buying placements from striking distance |
| [Private Indexer Network](Indexer-Network) | Doorway-domain network (advanced, read the risks first) |
| [Browser Extension and Mobile App](Extension-and-PWA) | The Chrome/Edge extension, installing as a PWA, push notifications |
| [MCP Server (AI Agents)](MCP-Server) | Connecting Claude Code, Claude Desktop, Cursor or Codex to your data |

## Help

- **[Troubleshooting](Troubleshooting)**: login loops, `redirect_uri_mismatch`, build killed, empty GA4, failed updates.
- **[FAQ](FAQ)**: short answers to the questions people ask most.
- **[For Developers](For-Developers)**: architecture pointers, schema changes, i18n, tests, contributing.

## Getting help

- Bugs and feature requests: [GitHub Issues](https://github.com/fenjo26/OpenGSC/issues). Include the version (shown at the bottom of the user menu), what you clicked and an excerpt from `pm2 logs opengsc`.
- Website: [opengsc.org](https://opengsc.org)
- Licence: [MIT](https://github.com/fenjo26/OpenGSC/blob/main/LICENSE)
