# SERP Monitor

**Top menu → Monitoring → SERP Monitor** (`/serp-monitor`). A rank tracker tells you where *you* stand. The SERP Monitor tells you what the **whole market** did: every check snapshots the entire **top-100** for each keyword and compares snapshots **by host**.

It answers three questions a rank tracker can't:

1. **Who entered and who dropped out** of the top-100?
2. **How hard did the whole market shake?** (storms)
3. **Who are these new domains?** First seen when, registered when, what DR.

## Requirements

- **A-Parser** with `SE::Google`, connected in Settings (see [SERP Providers and A-Parser](SERP-Providers-and-A-Parser#a-parser)). Without it the page shows a banner explaining what's missing.
- **Proxies that hold the volume.** This module is much hungrier than rank tracking (see below).
- v1 covers **Google desktop** only.
- After updating to a version with SERP Monitor, the deploy must have run `npx prisma db push` (`update.sh` does this).

## Projects

A project is **one market** (engine · country · language · device) plus a **keyword set**. Per project you set the depth, your own domains (highlighted everywhere), hidden hosts, storm notifications and retention.

### Sizing the load

The unit of work is **queries × pages**. Depth 100 = 10 Google result pages per query.

> 944 keywords × depth 100 ≈ 9,440 page fetches per run, once a day.

- **Depth is the lever.** Depth 20 is ten times cheaper than 100. If you only care about entries into the top 30, use depth 50.
- Wall time depends on A-Parser's thread count. A 944-keyword project with 20 threads takes a few tens of minutes. A run interrupted by a restart **resumes** where it stopped.
- Storage at that size: about 1.2 MB a day, about 450 MB a year before thinning.

## The three tabs

**Market**: one row per keyword: current leaders, host-level changes (`+host #34` entered at 34, `−host` dropped out, `↑ host 12→5`), volatility and your own position. Click a keyword for its full SERP history and a side-by-side diff of any two snapshots.

**Storms**: one point per run: the project's volatility against its own baseline, the verdict, the keywords that shook hardest and the hosts with the most entries and exits.

**Domains**: the newcomer catalogue: who holds how many keywords, who's rising or falling, tags **new** (first seen after the project's first run), **young** (registered recently; press *Load registration dates* for RDAP/WHOIS), **bounced** (entered and left within 7 runs), DR, referring domains, CSV export.

Social networks, app stores and Wikipedia are hidden from change lists by default (a `facebook.com` "entry" isn't news), but still count toward volatility.

## Honest failures: ok / partial / failed

| Status | Meaning | Used in comparisons |
|---|---|---|
| `ok` | At least 80% of expected rows | yes |
| `partial` | A short answer | yes, but only down to the depth it actually returned |
| `failed` | Empty, blocked, captcha, timeout, parser error | **never** |

A failed snapshot **never produces exits**. Without that rule one dead proxy would manufacture a fake mass exit across every keyword. A keyword survives any number of failed runs without losing its history.

## Storms

A storm is a run whose volatility is extreme **for this project**, not by an absolute bar. A churny gambling market and a calm B2B niche can't share a threshold.

- Volatility per keyword = `1 − RBO` (rank-biased overlap) between the previous and current host lists; a run's volatility is the median.
- A storm needs a baseline (previous 20 runs), enough compared keywords, a robust **z-score ≥ 3**, and **≥ 30% of keywords** above their own usual churn.
- **The first 7 runs are calibration.** The tab says *calibrating*, which means "no baseline yet", not "no storms".
- A storm sends **one** message to your notification channels: score, share of shaken keywords, the 5 most shaken keywords and the 5 hosts with the most movement. **Send a test storm alert** in project settings shows exactly what arrives.

## Retention

Full snapshots are kept for the project's retention window (180 days by default), then thinned to one per ISO week per keyword. The snapshot a keyword is currently compared against is never deleted.

## MCP

`serpmon_projects`, `serpmon_market`, `serpmon_keyword_history`, `serpmon_storms`, `serpmon_domains` (free reads) and `serpmon_run` (starts a check asynchronously).

## Limitations in v1

Google desktop only; serial A-Parser batches (very large projects are slow); one storm verdict per run. On MySQL, URLs longer than 191 characters can't be stored; run SERP Monitor on SQLite.

Full reference: [docs/SERP-MONITOR.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/SERP-MONITOR.md).
