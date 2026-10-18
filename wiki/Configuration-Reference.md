# Configuration Reference

OpenGSC is configured in two places:

- **`.env`** in the install folder (`/root/opengsc/.env`): things the server needs before anyone signs in, plus a few instance-wide overrides. After editing it, run `pm2 restart opengsc --update-env`.
- **Settings** in the web UI: every API key, provider choice, notification channel and schedule. Keys entered in the UI are stored in your own database and synced across your browsers.

The template with comments is [`.env.template`](https://github.com/fenjo26/OpenGSC/blob/main/.env.template).

## Required

| Variable | What it is | Example |
|---|---|---|
| `DATABASE_URL` | SQLite file, **absolute path**, kept under `data/` | `file:/root/opengsc/data/prod.db` |
| `NEXTAUTH_SECRET` | Random secret that signs sessions | output of `openssl rand -base64 32` |
| `NEXTAUTH_URL` | The exact public URL of the app. Must match the Google redirect URI | `https://gsc.example.com` |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud | `1234…apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | `GOCSPX-…` |

Never point `DATABASE_URL` at `./dev.db` in the repo root. That file is tracked by git and an update would overwrite it.

## Sign-in and ownership

| Variable | Default | What it does |
|---|---|---|
| `OPENGSC_OWNER_EMAIL` | unset (first Google sign-in wins) | Only these Google addresses (comma-separated) may become the owner of a fresh instance |
| `OPENGSC_ALLOW_GOOGLE_LOGIN` | unset | `true` reopens Google sign-in for the owner after a password is set. Use it as the way back in after a lost password |

## Security and network

| Variable | Default | What it does |
|---|---|---|
| `OPENGSC_ALLOW_PRIVATE_TARGETS` | off | `1` allows owner-driven audits of localhost/LAN addresses (blocked by default as SSRF protection). The public audit widget stays strict regardless |
| `CONTENT_OPS_SECRET` | falls back to `NEXTAUTH_SECRET` | Encrypts GitHub tokens stored for Content Operations. **Changing it, or `NEXTAUTH_SECRET` if it is the fallback, makes saved tokens unreadable** |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | unset | Cloudflare Turnstile for the public audit widget. Without them the widget works but can be spammed |
| `OPENGSC_LOG_BODIES` | unset (user decides) | Instance-wide override for capturing request/response bodies in the provider call log: on or off |

## Updates and backups

| Variable | Default | What it does |
|---|---|---|
| `OPENGSC_BACKUPS_KEEP` | `3` | How many pre-update database backups to keep in `data/backups` |
| `PM2_PROC_NAME` | `opengsc` | PM2 process name. Set it if the server runs other PM2 apps; otherwise the updater may `pm2 stop all` during the build |

## Integrations that can live in `.env`

Most providers are configured in the UI. These can also be set in `.env`. Where both exist, **`.env` wins**, and the UI shows that the value comes from the server.

| Variable | For |
|---|---|
| `OPENGSC_APARSER_BASE_URL`, `OPENGSC_APARSER_PASSWORD` | Your A-Parser instance (e.g. `http://127.0.0.1:9091`). See [SERP Providers and A-Parser](SERP-Providers-and-A-Parser) |
| `EASY_GR_USERNAME`, `EASY_GR_PASSWORD` | easy.gr registrar API: availability checks for `.gr` in Drops. IP-allowlisted on their side |
| `DYNADOT_API_KEY` | Dynadot registrar: second opinion on domain availability in Drops |
| `OPENGSC_FIELDLINK_TOKEN`, `OPENGSC_FIELDLINK_BASE_URL` | FieldLink link purchases (Magic links) |
| `OPENGSC_MAGIC369_TOKEN`, `OPENGSC_MAGIC369_BASE_URL` | 369Team link purchases (Magic links) |
| `OPENGSC_VAPID_PUBLIC_KEY`, `OPENGSC_VAPID_PRIVATE_KEY`, `OPENGSC_VAPID_SUBJECT` | Web Push keys. Normally generated automatically; set these only to share keys across instances. Both keys or neither |
| `GOOGLEBOT_PROXY` | Residential proxy (`http://user:pass@host:port`) for Googlebot View's headless-browser fetch on Cloudflare-protected sites |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Fallback AI key for unattended site setup (AI clustering of content groups) when no key is set in the UI |

## Where things are in Settings

Settings is grouped into four blocks. Old links such as `?tab=api-keys` still resolve to the new tabs.

| Group | Tab | What's there |
|---|---|---|
| Data sources | **My Google Accounts** | Connected Google accounts (GSC, GA4) |
| | **Bing Webmaster** | Bing API keys (one per Bing account) |
| | **Яндекс.Вебмастер** | Yandex.Webmaster OAuth tokens |
| Providers | **AI models** | AI provider keys, default model, custom OpenAI-compatible endpoint, per-task overrides, fact-check |
| | **SERP & scraping** | Serper, DataForSEO, ScrapingRobot, GoAnyAPI, Firecrawl, A-Parser, XMLRiver, rank-tracker provider and fallback, link-purchase tokens |
| | **SEO Metrics** | Ahrefs / Semrush / Majestic / DataForSEO / Keys.so for backlinks and keyword data, host (official / reseller / custom), monthly unit cap, CSV import |
| | **Indexing** | IndexNow key, 2index.ninja, NeuralIndexer |
| | **AEO & site health** | Perplexity and xAI keys for AI visibility; Safe Browsing, PageSpeed and VirusTotal keys |
| | **Provider log** | Every outbound call to a paid provider, with cost where the provider reports it |
| Notifications & integrations | **Notifications** | Telegram, Slack, Discord, Teams, e-mail, webhook, web push; alert rules |
| | **Integrations** | MCP token, audit widget, browser-extension token |
| Instance | **Team Members** | Members and roles, your password |
| | **Preferences** | Language, chart style, report branding |
| | **Sync** | Daily automatic GSC sync (off by default) |
| | **Uptime** | Uptime monitor defaults, heartbeat URL |
| | **Backups** | Scheduled, encrypted, offsite backups (owner only) |
