# Local SEO

**SEO Tools → Local** (`/local`). The source of truth for everything local: the business profile feeds NAP checks, schema, Google Business Profile and local rank tracking.

## Business profile

**Local → Business profile**: schema.org type, address by field, phone in E.164 format, opening hours per day, coordinates, `sameAs` links, price range and service areas.

- **Fill from site** parses the homepage's JSON-LD and meta tags to pre-fill it.
- There's no `MassageTherapist` type in schema.org; use `DaySpa` or `HealthAndBeautyBusiness`.
- Service areas can be handed to the Outline Generator as local landing briefs.

## NAP check (free)

Compares your **N**ame, **A**ddress and **P**hone against your own site: the homepage, up to 10 contact pages and the footer. Phones are compared by digits (E.164), addresses by normalized similarity, names without legal forms (Ltd, ΙΚΕ…).

## Citations

You enter links to your listings in directories. OpenGSC checks them against the profile **weekly** and suggests where else to be listed. For Greece, for example: GBP, Facebook, Apple Business Connect, Bing Places, xo.gr, vrisko.gr, 11888, TripAdvisor, Foursquare.

## LocalBusiness schema

Generates **LocalBusiness JSON-LD** from the profile, validates it against Google's requirements, and diffs it against what the site actually serves.

## Google Business Profile

- Connects through a **separate OAuth grant** (`business.manage`). Add the redirect URI the card shows to your OAuth client in Google Cloud.
- **GBP API access is granted by Google on request.** Until approved, your quota is 0, and the card says exactly that instead of showing errors.
- Reviews sync every 6 hours, and you can reply from the UI. Posts go draft → schedule → published by the scheduler. Photos are added by public URL.

## Local positions

Tracked in the [Rank Tracker](Rank-Tracker#local-pack): add a city or coordinates to a keyword and the map-pack place is stored separately from the organic position.

## Geo-grid scans

The Local Falcon question: **how far does your map-pack visibility actually reach?**

- One keyword, an **N×N grid** (3×3, 5×5 or 7×7) of coordinate points within your radius around the business. Each point is a real SERP check, with the pack matched against your profile name.
- The grid renders **green** (top 3), **yellow** (4–10) or **red** (not found), with each cell's number, plus average position and in-pack share.
- **Cost is stated before the button**: `gridSize²` queries on your SERP provider (49 for 7×7). Free on your own A-Parser, metered elsewhere.
- The centre defaults to the profile's coordinates. A profile without them asks instead of guessing.

**Presets** save a point + radius + grid + **answer language** + an optional cron schedule, with per-preset trends over time. The default language is the profile country's, but tourists search in their own, so EN/RU/DE overrides are one click. Missed scheduler ticks are skipped, never back-filled.

## MCP

`get_local_profile`, `check_nap`, `local_grid_scans`, `local_grid_scan_run` (paid), `local_grid_presets`, `local_grid_preset_create / _delete / _run`.
