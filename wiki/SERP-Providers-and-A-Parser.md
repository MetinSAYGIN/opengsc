# SERP Providers and A-Parser

Rank tracking, clustering, outlines, content analysis, plagiarism checks, `site:` estimates and geo-grid scans all need search results. You choose where they come from in **Settings → SERP & scraping**.

## Providers

| Provider | What it's good for | Pricing |
|---|---|---|
| **Serper.dev** | Cheap, simple Google SERPs with geolocation. **Best place to start** | ~$0.30–1 per 1,000 |
| **DataForSEO** | Google + Bing SERPs; the same credential unlocks Demand, AI Overviews, LLM Mentions, brand citations and backlinks. Paste the Base64 token or `login:password` | pay-as-you-go |
| **ScrapingRobot** | Rank tracking and SERP analysis | free tier 5,000 scrapes/month |
| **GoAnyAPI** | Credits for domain traffic, cached SERPs with DR/traffic per result, KD, backlinks | pay-as-you-go |
| **A-Parser** | Your own self-hosted scraper: no per-request cost, you pay for proxies | license + proxies |
| **XMLRiver** | Google SERP API used by the index checker and the backlinks indexed-status check | per check |
| **Firecrawl** | Not a SERP: a scraping fallback that gets past anti-bot pages and returns clean Markdown, used when a direct fetch of a competitor page fails | per page |

On the same tab, choose:

- the **active SERP provider** for content tools (clustering, outlines, analysis);
- the **Rank Tracker provider**, which can differ (e.g. something cheap for daily checks, something richer for occasional research). Empty means "use the active one";
- the **Rank Tracker fallback provider** for checks the first one couldn't answer (captcha, 503, "try again later").

Link-purchase tokens for [Magic links](Publishing-and-Magic-Links#magic-links) are on this tab too.

## A-Parser

[A-Parser](https://a-parser.com) is a commercial scraper you run on your own machine. Connected to OpenGSC it becomes a SERP provider, a rank-tracker backend, the source for [SERP Monitor](SERP-Monitor), an AI Overviews source and a GEO Audit engine. Requests cost nothing per call; **result quality depends on your proxy pool**.

### Connecting

1. In A-Parser: **Settings → API**: enable the API server and copy the password. Note the host:port it listens on (default `9091`).
2. In OpenGSC: **Settings → SERP & scraping → A-Parser**: base URL (e.g. `http://127.0.0.1:9091` when A-Parser runs on the same server; keep the external port closed) and the API password. Optionally a thread config name (empty = `default`). Press **Test**.
3. Or set it on the server, where it **takes precedence** over the UI:
   ```bash
   OPENGSC_APARSER_BASE_URL=http://127.0.0.1:9091
   OPENGSC_APARSER_PASSWORD=...
   ```
   An env-configured instance never fetches a URL typed into a browser, which is the safer deployment.
4. Docker: `127.0.0.1` inside the container is the container. Use the host's LAN IP or `host.docker.internal`.

Once connected, **Research → A-Parser** appears in the top menu: a console showing whether the instance is up, what it's running, which parsers this build has, whether proxies are behind it, and a test query.

> If you change the API password in A-Parser, update it in OpenGSC too (or in `.env`), otherwise every A-Parser feature reports it as unconfigured or failing.

### Rank Tracker on A-Parser

Uses `SE::Google::Position`, which stops at the results page where your site appears. A keyword in the top 10 costs one page, position 35 costs four, and only "not in the top 100" costs all ten.

1. Connect A-Parser (above). The instance needs `SE::Google::Position` and proxies Google accepts.
2. Optional sanity check on the server:
   ```bash
   cd /root/opengsc
   npx tsx scripts/aparser-position-probe.ts your-site.com "a keyword you rank for" gr el
   ```
   If an option reads `NOT in preset`, or the Position and full `SE::Google` numbers differ, don't switch yet.
3. **Settings → SERP & scraping → Rank Tracker provider → A-Parser**; optionally set a fallback.

Details worth knowing:

- Your site is matched as exact domains (`site.gr` and `www.site.gr`). A tracked apex ranking on `blog.site.gr` reads as "not found": a miss, never a false hit.
- Captcha solving is inherited from your `SE::Google` presets automatically.
- "Not found" is only stored if the parse went through all ten pages. A short parse is an error (`aparser_partial_serp`), so a dead proxy can't fake a rank drop.
- Local (city) keywords run as a normal `SE::Google` scan because `Position` doesn't accept geo.

### GEO Audit on A-Parser

Runs GEO Audit stage 1 through `FreeAI::ChatGPT` on your instance instead of a paid API. Geolocation follows the proxy's exit IP, and citations come typed with snippets.

1. Make sure `FreeAI::ChatGPT` is in your build (the A-Parser console lists parsers).
2. **SEO Tools → GEO Audit → engine: A-Parser.**

Web search is forced on for every request. The report names the model the free session actually served. Stage 2 (analysis) still runs on your **Utility** AI task. Without it, the audit ships with the deterministic half only. Driving a free consumer service through automation is your call to make against that service's terms.

### AI Overviews and SERP Monitor

- **AI Overviews** in [AI Visibility](AI-Visibility) uses DataForSEO when present, otherwise your A-Parser (`SE::Google`).
- **SERP Monitor** v1 runs only on A-Parser. See [SERP Monitor](SERP-Monitor).

Deep reference: [RANK-TRACKER-APARSER.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/RANK-TRACKER-APARSER.md), [GEO-APARSER.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/GEO-APARSER.md).
