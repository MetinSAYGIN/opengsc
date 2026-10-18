# Drops

**Top menu → Research → Drops** (`/drops`). A workbench for expired domains: import, vet, watch, buy only what's worth buying, then bring the bought domain back to life.

## The funnel

Import → **DNS pre-filter** → **registry check** → free → enrich → vet → buy. It's shown as a stage strip with live counts:

| Stage | Meaning |
|---|---|
| Imported | In the catalogue, not checked yet |
| No DNS | Not delegated; a candidate for the registry check |
| Delegated | Has DNS, so it's registered; retired for free, no registry call |
| Checking | Registry lookup in progress |
| Free / Confirmed free | Available. **Confirmed** needs two agreeing sources |
| Taken | Registered (can be watched) |
| no registry | The zone has no public registry (e.g. `.gr`). It's a stage, not a weekly retry |
| Rejected / Bought | Your decisions |

### Importing

Paste a raw list or upload a CSV. Rows are reduced to their registrable apex, and rejected junk is reported per reason. **Ahrefs exports are read by column**: the file's own DR and referring-domain numbers land on the rows at import, so those rows never need paid enrichment.

### Availability checks

- **RDAP + WHOIS**. A "free" verdict needs two agreeing sources.
- **Proxy pool** (optional) for the registry stage: SOCKS5 carries WHOIS (port 43 is raw TCP), HTTP proxies carry RDAP. Politeness is enforced per (zone, proxy) pair. IPv6 proxies don't help here.
- **Dynadot** (`DYNADOT_API_KEY` or the Settings card) as a second opinion.
- **`.gr`** has no public registry. It answers through the **easy.gr** registrar API (`EASY_GR_USERNAME` / `EASY_GR_PASSWORD`, IP-allowlisted, never proxied). A taken domain's expiry date becomes a future drop date for the watch loop.
- **Manual verdicts** for everything else: export a zone, check it in any registrar panel, paste the answers back.

### Enrichment before anyone spends

| Signal | Cost |
|---|---|
| DR with its monthly series (a fall of 5+ points flags a penalty, not lost links) | free |
| Wayback snapshots | free |
| Toxicity classifier over anchors and archived history | free |
| Majestic TF / CF in one batched call | ~$0.000002 per domain |
| Referring domains | paid, behind a confirm |
| **AI history pass**: reads the archived life of the domain, returns *clean / topic shift / spam period* | your AI key (cheap *Domain history AI* task) |

### Hard vetoes: what you can actually buy

Four conditions mean "don't buy, whatever the score":

1. a spam period in the archived history;
2. dead for more than two years;
3. a fall of ≥ 5 points across the monthly DR series;
4. Trust Flow 20+ points below a DR of 20+ (a bought profile).

A veto caps the score at 0 and shows as a red chip naming its evidence. The **no-veto** filter is your "what can I buy" view.

### Working the list

Range filters (DR, referring domains, TF), collapsible groups ("buy in October", "defer"), bulk actions over **everything matching the filter** (not just the visible page, minus rows you untick), CSV export or a plain domain list.

**Watch**: taken domains are re-checked by the scheduler (daily; every 15 minutes once the registry says `pendingDelete`, hourly in `redemptionPeriod`). A corroborated "free" sends **one** notification and ends that watch.

## Activation: reviving a bought domain

The **Activation** tab picks up where the funnel ends: from a freshly bought domain to one Google crawls and indexes again. The rule built into it: **the indexer network links to donor pages, never to the asset.**

1. **Harvest** the domain's legacy URL space from Wayback CDX (and GSC once the property exists).
2. **Bundle**: `sitemap.xml`, `robots.txt`, the IndexNow key file and an **nginx snippet**. Order matters: those three files must sit **before** the catch-all 301, or IndexNow silently rejects the key.
3. **Sitemap + Search Console is the main channel.** Add the property in GSC yourself (verification can't be automated), then submit the sitemap from the tab.
4. **IndexNow** for Bing/Yandex, in 10,000-URL batches.
5. **Donor accelerator**: doorways from the [indexer network](Indexer-Network) that have proven Google crawl (≥ 1,000 hits in 30 days, recomputed live) enqueue **donor** URLs only.
6. **Measure**: paste the asset host's nginx access log and the parser counts Googlebot hits (total, last 7 days, last seen).

**Glue** (hreflang/canonical "gluing" of a drop to a money site): builds annotation blocks in *cluster* mode (mutual, each page canonical to itself) or *funnel* mode (canonicals point at the drop), and checks a live cluster for reciprocity, self-reference, `x-default`, dead/noindex targets and cloaked annotations.

## MCP

`drops_list`, `drops_ingest`, `drops_prefilter`, `drops_check`, `drops_enrich_dr / _tf / _refdomains / _wayback`, `drops_history_ai`, `drops_toxicity`, `drops_dr_history`, `drops_groups`, `drops_watch`, `glue_plan`, `glue_check`. Enrichments that spend units or AI credits need `confirm: true`.
