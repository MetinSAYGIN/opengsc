# Notifications, Alerts and Digests

OpenGSC pushes what matters to channels **you** own. No third-party notification service is involved and it's free. Configure everything in **Settings → Notifications**.

## Channels

| Channel | You need | Notes |
|---|---|---|
| **Telegram** | A bot from [@BotFather](https://t.me/BotFather) | Paste the token, press **Detect chat id**, send any message to your bot, press **Detect** again |
| **Slack** | An Incoming Webhook URL (`https://hooks.slack.com/services/…`) | |
| **Discord** | Server Settings → Integrations → Webhooks → New Webhook → Copy URL | Long messages are split; `@everyone` never pings |
| **Microsoft Teams** | A **Workflows** webhook ("Post to a channel when a webhook request is received") | Old Office 365 connectors are retired |
| **E-mail (SMTP)** | Your mail server: host, port 587 (STARTTLS) or 465 (TLS), login, password, from, up to 10 recipients | Gmail needs an **app password**, not the account password |
| **Webhook** | Any HTTPS endpoint | JSON POST, optional HMAC-SHA256 signature in `X-OpenGSC-Signature` |
| **Web Push** | HTTPS and a subscribed device | See [Browser Extension and Mobile App](Extension-and-PWA) |

Every channel has **Send test** (works even while the channel is switched off) and shows its last successful delivery or last error. Channels are independent: one failing never blocks the others. Secrets are stored server-side and always shown masked. Leaving a secret field empty on save keeps the stored value.

### Event filter per channel

Each channel picks the events it receives. **No selection = everything.**

| Event | Triggered by |
|---|---|
| `alert` | Rank drops, traffic drops, SSL expiry, low audit score, lost backlinks, provider trouble, SERP storms, watched drops becoming free |
| `digest` | Scheduled portfolio digests |
| `uptime` | Site down / recovered / still down |
| `index` | Pages with traffic dropping out of Google's index |
| `mention` | Daily brand-mention summary |
| `backup` | Failed scheduled backups |

Some modules add their own (`local` for map-pack changes, `trend` for rising queries, `lead` for new leads). Push devices have their own filter too.

Example: uptime to Discord, digests only to e-mail, everything to Telegram.

## Alerts

Checked hourly; each event fires once (deduplicated). Thresholds are set per rule in **Settings → Notifications**:

- a tracked keyword fell **N+ positions**;
- a site's clicks dropped **X%+ week over week**;
- an **SSL certificate** is about to expire;
- a site audit came back with a **low health score**;
- a referring domain above a DR threshold was **lost**;
- a page with traffic **left Google's index** (from [automatic index checks](Indexing#automatic-index-checks-free));
- uptime transitions (see [Uptime](Site-Audit-Health-Uptime#uptime-monitor)).

Alerts and digests are sent in the language set in **Settings → Preferences**.

## Digests

**Top menu → Monitoring → Digest.** A portfolio report over **all sites or one tag**, so a site network you care about gets its own summary.

- **On screen**: explicit date range, portfolio KPIs, biggest gainers and losers, rising and falling queries, *all* striking-distance queries, sites needing attention, rank movements, rising trend queries. Each section has "show all" and CSV.
- **Delivered to channels**: a shorter text summary of the same report (long messages are split for Telegram's limit). The rich view stays on screen.
- **Google / Bing / Yandex** tabs split the report per engine.
- **AI conclusion** on top (your AI key). On by default when any AI key is configured.
- **Preview**, **send now**, or **schedule** daily or weekly delivery to any channel with the `digest` event, e-mail included. Telegram isn't required.

## Webhook format

```json
{
  "event": "alert",
  "title": "📉 example.com: pages left Google's index",
  "text": "example.com — 2 page(s) with traffic are no longer indexed: …",
  "markdown": "*example.com* — 2 page(s) …",
  "createdAt": "2026-10-01T06:30:00.000Z",
  "instance": "https://your-opengsc.example"
}
```

Verify the signature over the **raw** body:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", SECRET).update(rawBody).digest("hex");
const ok = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Telegram: chat id not detected | Open your bot, press **Start** / send a message, then **Detect** again |
| `SMTP login failed` | Wrong login or (for Gmail) not an app password |
| `Cannot reach the SMTP server` | Wrong host/port, or your VPS provider blocks outbound SMTP (many block port 25; use 587/465) |
| Webhook / SMTP to an internal address refused | By design: internal and private addresses are blocked (SSRF guard) |
| Nothing arrives for an event | Check the channel's event filter includes it |

Reference: [docs/NOTIFICATIONS.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/NOTIFICATIONS.md).
