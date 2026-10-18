# What Needs What

OpenGSC follows one rule: **nothing is required, and nothing spends money without telling you first.** A fresh install with only the Google OAuth app already gives you the full GSC dashboard, analytics, audits, uptime and alerts. Everything else turns on when you add the key it needs.

How to read the tables:

- **Free**: runs on your server or on a free public endpoint.
- **Free key**: needs an account or API key, but the provider doesn't charge for normal use.
- **Google quota**: free, but spends a daily Google API quota on your own OAuth.
- **Paid**: bills your own key or balance. Every paid button shows its price before you press it, and paid MCP tools refuse to run without `confirm: true`.
- **Self-hosted**: runs on your own A-Parser; you pay only for its proxies.

## Works out of the box (Google OAuth only)

| Feature | Where | Cost |
|---|---|---|
| Portfolio dashboard, every site from every Google account | Dashboard | Google quota |
| Clicks / impressions / CTR / position, period comparison, countries, devices | Site → Dashboard | Free (local data) |
| Potential (striking distance), Cannibalization, Content Decay, CTR benchmark | Top menu → Analytics | Free |
| Annotations on the traffic chart | Site → Annotations | Free |
| Ahrefs Domain Rating badges on site cards | Dashboard | Free (public endpoint, cached 7 days) |
| Site audit crawler (up to 500 pages), AI-crawler check, `llms.txt` | Site → Audit, Top menu → Audits | Free |
| Uptime monitor and incident history | Dashboard dots, Site → Health | Free |
| SSL certificate check | Site → Health | Free |
| Sitemap inventory and diff | Site → Indexing | Free |
| URL Inspection, manual and automatic (2,000 per property per day) | Site → Indexing | Google quota |
| Alerts and digests | Settings → Notifications, Digest | Free (you bring the channel) |
| Trend radar (rising GSC queries + Google autocomplete) | SEO Tools → Demand | Free / Google quota |
| Brand mentions (Google News, Wikipedia, Wikidata) | Site → Visibility → Mentions | Free |
| Footprints report, hreflang generator | SEO Tools | Free |
| Backlink toxicity, disavow file, lost-link recovery | Site → Backlinks | Free (local math on imported rows) |
| Local business profile, NAP check, LocalBusiness JSON-LD | SEO Tools → Local | Free |
| Competitor crawler (tech stack, shared-owner signals) | Top menu → Crawler | Free |
| Googlebot View (multi-UA fetch, cloaking diff) | SEO Tools → Googlebot View | Free (True Google View uses Google quota) |
| Client reports and share links | Reports | Free (e-mail needs SMTP; PDF needs a headless browser on the server) |
| Audit widget and leads | Settings → Integrations, Leads | Free |
| Shared read-only dashboards | Site → Settings → Public Link | Free |
| PWA, web push, browser extension | Settings | Free (push needs HTTPS) |
| MCP server, local-tier tools | Settings → Integrations | Free |
| Importing Ahrefs / Semrush CSV exports into the metrics cache | Settings → SEO Metrics | Free |
| Scheduled encrypted backups, SFTP offsite | Settings → Backups | Free |

## Needs a free key or account

| Feature | What to get | Page |
|---|---|---|
| GA4 tab | Analytics Data + Admin APIs in your Google project | [Google Cloud Setup](Google-Cloud-Setup#google-analytics-4) |
| Microsoft Clarity tab | Clarity project + API token | [Google Cloud Setup](Google-Cloud-Setup#microsoft-clarity) |
| Safe Browsing, Core Web Vitals | Google API key (Safe Browsing API, PageSpeed Insights API) | [Health check keys](Site-Audit-Health-Uptime#health-check-keys) |
| VirusTotal reputation | VirusTotal key (free tier: 500/day) | same |
| Bing dashboards, sitemap submit | Bing Webmaster **API key** | [Indexing](Indexing#bing-webmaster-and-yandexwebmaster) |
| Yandex dashboards, recrawl | Yandex OAuth token | same |
| IndexNow pushes | A key file on your site | [Indexing](Indexing#indexnow) |
| Telegram / Slack / Discord / Teams / e-mail / webhook | The channel's bot, webhook or SMTP | [Notifications](Notifications) |
| Google Business Profile reviews and posts | GBP API access (granted by Google on request) | [Local SEO](Local-SEO#google-business-profile) |
| Publishing to WordPress | WordPress application password | [Publishing](Publishing-and-Magic-Links) |

## Needs a paid key (yours)

| Feature | Needs | Typical cost |
|---|---|---|
| Rank Tracker | A SERP provider: Serper, DataForSEO, ScrapingRobot, or your A-Parser | Serper ≈ $0.0003 per check; A-Parser: proxies only |
| AI SEO Tools (outlines, articles, rewriter, landing, analysis, policy) | An AI provider key | Your provider's token price, no markup |
| Keyword clustering, outline / gap research | SERP key (+ AI key for outlines; Firecrawl optional for anti-bot pages) | per SERP query |
| AI Visibility: live AI-answer checks | OpenAI / Anthropic / Gemini / Perplexity / xAI keys (web search on) | about 4 billed calls per question per check |
| AI Overviews as an engine | DataForSEO (SERP Advanced) or A-Parser | per SERP |
| LLM Mentions index, share of voice vs competitors in the index | DataForSEO | per request |
| Demand (keyword research, domain overview) | DataForSEO | ≈ $0.03 per 150-row search; cached 14 days |
| Citation & Sentiment tracker | DataForSEO Content Analysis | per request |
| Keyword volume / KD / CPC, backlink profiles, competitor gap | Ahrefs, Semrush, Majestic, DataForSEO or Keys.so (**or free CSV import**) | priced per action; monthly unit cap |
| Link Monitor (fresh competitor backlinks) | Ahrefs API v3 | units per pull |
| GEO Audit | OpenAI, kie.ai, Gemini, or A-Parser `FreeAI::ChatGPT` | one agentic web-search run |
| Plagiarism check, `site:` index estimate, geo-grid scans | SERP provider | per query, price shown first |
| Backlink indexed-status checks | XMLRiver | per check |
| Index accelerators | 2index.ninja, NeuralIndexer | their pricing |
| Magic links (buy posts from striking distance) | FieldLink or 369Team balance | per placement |
| Drops enrichment | Majestic TF/CF (tiny), refdomains (Ahrefs), AI history pass (AI key) | priced per batch |
| SERP Monitor | A-Parser with `SE::Google` + proxies | self-hosted |

## Spending controls you have

- **Prices before buttons**: every paid action shows its estimate first.
- **Monthly unit cap** for metrics providers (Settings → SEO Metrics), enforced server-side *before* the request is sent.
- **Opt-in schedules**: automatic AEO checks, weekly backlink refreshes and similar jobs are **off by default**, so a big portfolio never signs itself up for a bill.
- **Roles**: only *Admin* and *Owner* can spend. Editors and viewers can't trigger paid calls. See [Team roles](First-Login-and-Team#team-members-and-roles).
- **Provider log** (Settings → Provider log): every outbound paid call with its status and the cost the provider reported.
- **MCP `confirm: true`**: an AI agent can't spend your credits by exploring tools.
