# Site Audit, Health and Uptime

Three free checks that run from your own server.

## Site Audit

Site → **Audit** tab. A technical crawl with **no external APIs**: OpenGSC crawls the site from your VPS, breadth-first from the root, up to **500 pages**.

### What it checks

- Broken internal links; internal links pointing at redirects.
- Titles and meta descriptions: missing, too long, too short, duplicated. Title/H1 alignment with the page's main GSC query.
- H1 problems, `noindex` pages, canonical mismatches, thin content, images without `alt`, slow responses, non-responsive viewports.
- **Client-rendered (JS) pages**, where static HTML signals can't be trusted.
- **hreflang**: return links, targets, `x-default`, agreement with `<html lang>`.
- A mobile **PageSpeed sample**: one page per template, using field data when Google has it (needs the PageSpeed key below).
- **AI Crawlability**: are GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended, CCBot or Bytespider blocked in `robots.txt`, and does `/llms.txt` exist? A root `Disallow` on GPTBot is a silent reason an answer engine never cites you.

### The health score

Severity-weighted (since 1.10):

- a **critical** error zeroes that page;
- each **warning** costs a few points;
- informational findings and plain internal redirects don't lower the score;
- the site score is the average over pages.

So "mostly minor warnings" no longer reads as 0/100.

### Working with results

- The run is a background job. You can leave the page.
- Filterable per-page issue table, run history, regression verdicts between runs.
- **Export as Markdown**, or share a run as a public **`noindex`** Markdown link.
- Audit findings can suggest a **fixed meta** title/description that fits the limits.
- **Top menu → Analytics → Audits** shows every run across all sites, including sites never audited.
- **Settings → Notifications** alert rule: *audit came back with a low health score*.

### Auditing local or staging sites

By default the crawler refuses localhost and private/LAN addresses (SSRF protection). To audit a staging site on the same network, set `OPENGSC_ALLOW_PRIVATE_TARGETS=1` in `.env`.

## Health checks

Site → **Health** tab.

| Check | Provider | Key |
|---|---|---|
| SSL certificate (expiry, issuer, grade) | direct TLS handshake | none, always on |
| Google Safe Browsing | Safe Browsing API | Google API key |
| Core Web Vitals (LCP, INP, CLS, TTFB, performance) | PageSpeed Insights API (mobile) | Google API key |
| Malware / engine scan | VirusTotal | VirusTotal key |

Results are cached for 24 hours. Re-running overwrites the cache. Only the site's URL is sent to each provider.

### Health check keys

Configure them in **Settings → AEO & site health → Health Check API Keys**.

**The checks run on your server, not in your browser.** This decides how the keys may be restricted:

- **Never restrict by HTTP referrer** ("Websites"). Server requests have no `Referer` and Google answers `Requests from referer <empty> are blocked`.
- **Restricting by IP?** Add the server's IPv4 **and** IPv6 (`curl -4 ifconfig.me`, `curl -6 ifconfig.me`). Outbound traffic can use either.
- Key changes take up to 5 minutes to propagate on Google's side.

**Google Safe Browsing**

1. In Google Cloud, **enable the Safe Browsing API** for the project ([link](https://console.developers.google.com/apis/api/safebrowsing.googleapis.com/overview)). Creating a key alone isn't enough.
2. **APIs & Services → Credentials → Create credentials → API key.**
3. Recommended: **API restrictions → Safe Browsing API**; **Application restrictions → None** (or IP addresses with v4 + v6).
4. Paste it into Settings.

**PageSpeed Insights**

1. Enable the **PageSpeed Insights API** ([link](https://console.developers.google.com/apis/api/pagespeedonline.googleapis.com/overview)).
2. Create a key (or reuse the Safe Browsing key and tick both APIs in its restrictions).
3. Paste it into Settings.

A heavy page may hit `PageSpeed timed out after 45 s`. Re-run; if it happens every time, Lighthouse genuinely struggles with the page.

**VirusTotal**

Register at [virustotal.com](https://www.virustotal.com), copy the key from [your profile](https://www.virustotal.com/gui/my-apikey), paste it into Settings. Free quota: 4 requests per minute, 500 per day. New domains may return `not_found` until VirusTotal has seen them. That's normal.

| Error | Fix |
|---|---|
| `Safe Browsing API has not been used in project … or it is disabled` | Enable the API in the key's project, wait, re-run |
| `Requests from referer <empty> are blocked` | Remove the Websites restriction (use None or IP) |
| `… IP address restriction … violates this restriction` | Add the IP named in the error (often the IPv6), or use None |
| VirusTotal `not_found` | Fresh domain; retry later |

## Uptime monitor

Free: one HTTP GET from your server to your site. Every live site gets a monitor automatically (configurable).

- **Status dot** on every dashboard card; offline sites float into **Needs attention**.
- **Site → Health**: 30-day latency history, incidents, uptime % (7 / 30 / 90 days).
- **Settings → Uptime**: defaults for the whole workspace.

### What's checked

- URL: the site root by default; change it to any page or a `/health` endpoint.
- Accepted status codes: `200-399` by default (ranges and single codes, comma-separated).
- Optional **keyword** the page must contain. This catches "200 OK but an empty template".
- Interval: 1–60 minutes. User-Agent `OpenGSC-Uptime/1.0`, up to 5 redirects.

### When it says "down"

- Only after **N consecutive failures** (default 2). The first failure schedules a quick re-check after 30 seconds.
- The incident starts at the **first** failure of the streak, so downtime isn't under-reported.
- **Only transitions alert**: up → down, and down → up (with the downtime duration). A site that was already down when monitoring started doesn't page you. Optional reminders every N hours while down; optional alerts for "slow" (off by default).

### No false alarms when your server's network dies

- If most sites fail with network errors in the same pass, the problem is the server, not the sites. Statuses freeze as "check unavailable (server network)". No incidents, no alerts.
- Before any monitor goes **offline**, the server asks two outside witnesses (`google.com/generate_204` and Cloudflare's trace). If both are unreachable, the outage is on your side and confirmation waits.

### Heartbeat: who tells you the server itself died?

**Settings → Uptime → Heartbeat URL.** OpenGSC pings it at most once a minute. A service like healthchecks.io, an UptimeRobot heartbeat or Better Stack alerts you when the pings stop, which means your VPS, container or process is down.

### Cloudflare returns 403 to the checker

Some WAFs block unknown User-Agents. Add the expected code to the accepted list on the Health tab, e.g. `200-399,403`. Same for `401` behind basic auth.

### Data kept

Raw checks for 7 days, daily aggregates forever, incidents with start, end and cause.

## MCP

`get_site_audit`, `get_site_health`, `get_uptime`. All are free reads.
