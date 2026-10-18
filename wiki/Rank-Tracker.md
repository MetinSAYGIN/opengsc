# Rank Tracker

Site → **Positions** tab. Tracks keyword rankings by country, language and device, and overlays them on the real Search Console average position, clicks and impressions for the same query. You can see whether a rank change actually moved traffic.

## What you need

A SERP provider, configured in **Settings → SERP & scraping**:

| Provider | Notes |
|---|---|
| **Serper.dev** | Cheapest pay-as-you-go start; supports geolocation |
| **DataForSEO** | Same credential is reused for Demand, AI Overviews, LLM Mentions and backlinks; supports city and coordinates |
| **ScrapingRobot** | Alternative API; no city-level geo |
| **A-Parser** (self-hosted) | Pay only for proxies; uses `SE::Google::Position`. See [SERP Providers and A-Parser](SERP-Providers-and-A-Parser#rank-tracker-on-a-parser) |

Pick the **Rank Tracker provider** and an optional **Fallback provider** on the same tab. Only checks the primary couldn't answer go to the fallback.

## Adding keywords

- Add one at a time or in bulk, one per line.
- Each keyword has a **country**, **language** and **device**. Selecting a country preselects its main language.
- **City or coordinates** (optional): `Thessaloniki, Greece` or `40.5197,22.9709`. The city is part of the keyword's identity, so the same query from Thessaloniki and from Athens are two rows. In bulk, use `keyword,city`.

## How checking works

- **Check positions** runs immediately.
- **Automatically**: an hourly background job re-checks every tracked keyword whose last check is older than about 20 hours. So **every tracked keyword is checked roughly once a day for as long as a SERP key is configured.** That's what you pay for: keywords × days. Archived sites are skipped.
- Each check stores which provider answered (hover over the position to see it).
- Transient errors (timeouts, 5xx, captchas, "try again later") are retried once after 10 seconds, then sent to the fallback provider. If both fail, the error names both and the last known position stays on screen.

## Local pack

For a keyword with a city or coordinates, the **map three-pack** is tracked as its own number next to the organic position:

- `position`: organic only.
- **Local pack**: `#1–3`, *not in pack*, *no pack on this SERP*, or `—` (the provider doesn't report it).

The pack place never leaks into the organic position, so graphs, best position and the rank-drop alert keep their meaning. Your business is matched by domain first, then by the business name from your [Local profile](Local-SEO).

Geo needs Serper, DataForSEO or A-Parser. Other providers return `location_unsupported` instead of silently checking the whole country. A city the provider doesn't recognize returns `location_unknown`.

Pack changes are reported once per day per site (notification event `local`).

## Alerts

**Settings → Notifications → alert rules**: *a tracked keyword fell N+ positions*. See [Notifications](Notifications).

## Geo-grid scans

How far does your map-pack visibility reach around the business? That's a grid scan, run from the Local module. See [Local SEO → Geo-grid](Local-SEO#geo-grid-scans).

## MCP

`get_rank_tracker` (current standing) and `get_rank_history` (every check point). Both are free local reads.
