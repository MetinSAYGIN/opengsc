# SEO Tools (AI Content Suite)

**Top menu → SEO Tools** opens a hub with one tile per tool. A tab bar on each tool page switches between them quickly.

Most tools need **your own keys**: an AI provider for writing (see [AI Providers and Models](AI-Providers-and-Models)) and a SERP provider for research (see [SERP Providers and A-Parser](SERP-Providers-and-A-Parser)). You pay providers at cost, with no markup. The header of every AI tool names the model that will actually run and, when expanded, which settings level that choice came from.

Long jobs (clustering, outlines, articles, rewrites) run **in the background on the server**. Close the tab and the result lands in **History**.

## Research

### Demand

Keyword research that starts from the **market**, not from queries you already rank for. It's the only place that can return keywords Search Console has never heard of. Runs on **DataForSEO**.

- **By keyword**: a seed returns real searches with volume, difficulty, CPC, intent and a 12-month trend. Every row is then matched against *your* GSC history: **within reach** (you're in the top 30, improve that URL), **wrong page** (impressions but nothing wins), **no content** (write it).
- **By domain**: estimated traffic, keyword count, position-band distribution, top terms and pages for any domain, including competitors, prospects or a drop you're considering.
- Modes `related`, `suggestions`, `ideas`, or **Auto** (stops at the first source with enough terms, so you aren't charged three times).
- Cached: searches 14 days, domain overviews 7 days. Replaying a paid question is free. Discovered keywords feed the shared metrics cache, so their weights appear in Potential and Rank Tracker for free.
- **Trend radar** sits on this page: rising GSC queries (7 days vs. the previous 28), queries new to your site, and Google autocomplete for your seeds. Free. See [Notifications](Notifications) for the daily "rising queries" message.

### Competitors

Find competitors, pull one's keywords, and cross them with your GSC data into three verdicts: **within reach**, **wrong page**, **no content**. Needs Ahrefs or Semrush (or Keys.so for the Yandex market). Recomputed on every read, because your positions change daily and theirs change slowly.

### Clustering

Paste a keyword list. OpenGSC pulls a live top-10 SERP for each keyword and groups keywords whose results share N+ URLs (threshold selectable): the "one cluster = one page" method, based on what Google actually ranks together. Optional DataForSEO volumes, CSV export, one-click hand-off of a cluster to the Outline Generator.

### GEO Audit

Sends a real user question to an AI model **with live web search on**, and mines the model's own search trace and citations: which brands and domains get surfaced and cited, which selection factors drove the answer (price, support, features…), which source types dominate (official sites, marketplaces, reviews, forums, Wikipedia, editorial), and where your gaps are. Output: brand leaderboard, per-domain trust signals, source-type breakdown, written insight.

Engines: **OpenAI**, **kie.ai**, **Gemini**, or **A-Parser `FreeAI::ChatGPT`** (no per-token bill; see [A-Parser](SERP-Providers-and-A-Parser#geo-audit-on-a-parser)). No separate SERP key is needed. History is stored on the server.

### Local

The Local SEO module: business profile, NAP, citations, schema, GBP, geo-grid scans. See [Local SEO](Local-SEO).

## Writing

### Outline Generator

Enter a keyword, country, language and engine (Google or Bing). OpenGSC runs a live SERP, classifies each ranking page by **site type** (official store, monobrand, aggregator, forum/UGC, editorial) and **intent** (buy / info / review / listicle / use-case), lets you pick competitors, scrapes them (direct fetch, Firecrawl fallback on anti-bot pages), and runs a multi-pass pipeline:

1. **Map**: verified facts from each competitor separately.
2. **Reduce**: one Entity-Attribute-Value outline: headings, per-section word budgets, weighted entities, keywords, FAQ, visual-element suggestions.
3. **Fact-scrub**: corrects fabricated-looking specifics before they can reach the article.
4. **Structure-expand**: adds H3s under headings that came back too flat.
5. **Heading-localize**: headings in the article's language and voice.
6. **Volume-normalize**: section budgets add up to your target length.
7. **Section-enrich**: deeper notes per section, so the outline reads like a real brief.

Optional **Casino RAG** grounds igaming outlines against a verified knowledge base of slot facts (RTP, volatility, provider, release date).

### Text generation

Writes the full article from an outline in History, in the background. Long outlines are written in chunks of 3–5 sections in parallel, so quality doesn't degrade halfway through.

- Tone / persona, an [Editorial Policy](#editorial-policy), optional table of contents.
- **Source grounding**: off, *facts only* (real numbers, no competitor names or links), or *cited* (inline source links, at most one per 1–2 paragraphs).
- **Volume guard** keeps the final length within ±15% of target, as the very last step.
- **Meta tags are fitted by code**, not by asking the model to count characters: same limits as the audit.
- Optional **temperature** (warned above 1.2) and **ban markers** (forbid the vocabulary from your AI-Fingerprint model).
- **Invisible-marks scrub** (on by default): removes zero-width characters, bidi controls, soft hyphens and similar leftovers, and counts what was removed.
- A **QA judge** (its own model slot) checks the finished piece is complete before it's saved. Failures show a real reason, e.g. a provider's content-policy rejection.

### Landing-flow

The same SERP → select → scrape research, aimed at **commercial pages**. Strategies: mirror the SERP consensus, copy your own page 1:1, a hybrid, or an "SEO block" layout. Outputs: a technical brief, brief + full text, or a block-by-block wireframe (hero, USP bar, comparison table, FAQ, CTA…). You can import your page's structure from its live HTML or **from a screenshot** (vision model).

### Rewrite (Content Rewriter)

Paste text or a **URL** and get 1–5 unique variants that keep the meaning, facts, numbers, entities and links. Same format in and out (HTML→HTML, Markdown→Markdown). Each variant shows:

- a **uniqueness score** (word trigrams vs. the source) and word count;
- an **AI score** if you trained a fingerprint model;
- **fact drift**: numbers, amounts, percentages and identifiers that **appeared** (red, invented) or were **dropped** (amber). Currencies are normalized (`$50` = `50 USD`). No model call, no cost.

Options: language, tone, temperature, ban markers, *mask AI patterns* (readability cleanup, not anti-detection). Content Decay has a one-click **Rewrite** per page.

### Humanize (AI-Fingerprint Lab)

Statistical AI detectors score token-frequency distributions over ~300-word windows, so the signal can be reproduced locally. This lab trains a bag-of-words discriminator **on your own two corpora**: competitor pages from the SERP as the human reference, your generation History as the machine reference. No detector API, nothing leaves your server.

- **Analyze**: averaged score, a **per-window heatmap**, the marker words that moved the score, and a **Humanize** action that rewrites with those markers banned and shows before → after. It also scans for hidden characters.
- **Corpus**: harvest references by keyword or URL list, train named models (one per niche and language). A held-out **separation** score shows when a model is weak.
- **Bench**: run one prompt across your models and temperatures and rank them. Model choice matters more than prompt tricks.

The **marker list** is the real output: export it into generation as banned words. Words used by 40%+ of competitor pages are treated as niche terminology and never suggested. You can review and un-ban any word.

### Editorial Policy

A reusable style guide, written by you or drafted by AI from your own brand pages: brand and values, audience, voice and formality, structure rules, quality bar (citations, E-E-A-T, fact-checking), hard restrictions (banned words and topics, compliance rules like "never invent a licence number; leave a placeholder"). Keep up to 10 and mark one active. It applies across Outline, Text and Landing.

The policy deliberately doesn't include instructions like "sound natural" or "vary sentence length". Testing showed such directives make text read *more* machine-like. Concrete banned words don't have that problem.

### History

One log of every Cluster, Outline, Text, Analysis and Landing run. Jobs survive closed tabs; anything stuck "processing" with no heartbeat for 20 minutes is marked failed. With a fingerprint model active, each article shows its AI score in the list. History, keys, model choices and policies are **backed up on the server**, so clearing the browser loses nothing.

From an article you can open **Plagiarism check**, **Publish** (see [Publishing](Publishing-and-Magic-Links)), or send it to **Content Ops**.

## Quality and analysis

| Tool | What it does | Cost |
|---|---|---|
| **Content Analysis** | Gap report vs. competitors for a keyword (and optionally your URL): missing topics, entities and sections, each with add / expand / merge / skip and the competitor URLs that justify it | SERP + AI |
| **Plagiarism check** | Picks up to 10 exact fragments, searches them in quotes through your SERP provider, reports sources. An estimate, not a verdict. Same text within 7 days is free | per query, price first |
| **Hreflang generator** | `<link rel="alternate">` block, sitemap `xhtml:link` variant and HTTP-header variant from a URL + language list; optional live check | Free |
| **Footprints** | Title/H1/description templates repeated across several of *your* sites, a visible network footprint. Found templates are banned from new outlines | Free (local) |
| **Googlebot View** | Fetches a URL with several User-Agents (Googlebot smartphone/desktop, a browser, Googlebot + SERP referer), walks redirect chains hop by hop and diffs the responses to flag **cloaking, hidden redirects and PBN schemes**. For your own GSC sites it adds **True Google View** from URL Inspection. Optional headless-browser mode for Cloudflare sites (`GOOGLEBOT_PROXY`) | Free / Google quota |
| **Brand citations** | Web-wide brand mentions with sentiment (polarity, six emotions), monthly trend, top citing domains via DataForSEO Content Analysis | DataForSEO |

## Links and operations

### Link Monitor

Watch competitor brand domains and pull their **fresh quality backlinks** through your Ahrefs API v3 key: in-content, live, DR ≥ 50 (configurable), first seen in the last 3 months, one per referring domain. It highlights **multi-linker domains** (sites linking to two or more of your watched brands, your best outreach targets) and runs an AI pass over the patterns. Save results into the **Outreach Workspace**, which tracks campaigns, evidence, contacts, follow-ups, stage history and the link eventually won. OpenGSC can draft a pitch but **never sends e-mail**.

### Content Ops

Moves an existing draft through **idea → approval → review**, previews a deterministic diff, and creates a **GitHub branch and pull request** only after you confirm. It never writes to the base branch and never auto-merges. Connect a scratch repository first and watch one item go end to end.

- **Source Audit** (read-only): runs bounded Next.js SEO, performance, correctness, security and architecture checks on a branch snapshot (up to 80 files / 4 MB), before deployment. It's separate from the runtime Site Audit.
- After merge, OpenGSC waits for the live URL to return HTTP 200, then links it into Indexing and the Rank Tracker and measures outcome windows at **7, 30 and 90 days** against a 28-day baseline.
- The GitHub token is encrypted with `CONTENT_OPS_SECRET` (or `NEXTAUTH_SECRET`); keep that value stable.

## SEO Settings

The last tile links to **Settings → AI models** and **Settings → SERP & scraping**, where keys and per-task models live.
