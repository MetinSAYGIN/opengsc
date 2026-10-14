# Troubleshooting

**First step for almost anything:** `pm2 logs opengsc --lines 200` on the server. OpenGSC logs the real reason (provider status, Google error, failing step) instead of a generic error.

## Sign-in

<details>
<summary><b><code>redirect_uri_mismatch</code></b></summary>

`NEXTAUTH_URL` in `.env` doesn't match the **Authorized redirect URI** in Google Cloud. They must be identical, including `http` vs `https`, plus `/api/auth/callback/google`:

```
NEXTAUTH_URL="https://gsc.example.com"
redirect URI:  https://gsc.example.com/api/auth/callback/google
```

After editing `.env`: `pm2 restart opengsc --update-env`. If you installed without SSL, `NEXTAUTH_URL` is `http://…`; either use `http://` in Google too or add SSL and switch both to `https://`.
</details>

<details>
<summary><b><code>access_denied</code> from Google</b></summary>

The OAuth app is in **Testing** and your account isn't under **Test users**. Add it, or publish the app. See [Google Cloud Setup](Google-Cloud-Setup#3-configure-the-consent-screen).
</details>

<details>
<summary><b>Endless redirect back to <code>/login</code></b></summary>

`NEXTAUTH_URL` doesn't match the address you're opening (domain, scheme, port), or the SSL certificate is invalid. Open the app at exactly the `NEXTAUTH_URL` address.
</details>

<details>
<summary><b>"Use your password" / Google sign-in refused</b></summary>

Working as designed:

- After the owner sets a password, Google is **no longer a login**, only a way to connect data accounts. Sign in with e-mail + password. To reopen Google login: `OPENGSC_ALLOW_GOOGLE_LOGIN=true` in `.env`, restart.
- A Google account that isn't the owner's is refused at the login page. Team members sign in with the e-mail/password they were given.
- On a fresh instance with `OPENGSC_OWNER_EMAIL` set, only those addresses can claim ownership.
</details>

<details>
<summary><b>Forgot the password</b></summary>

```bash
cd /root/opengsc && npm run set-password -- --email you@example.com
```
</details>

<details>
<summary><b>Someone else became the owner</b></summary>

The first Google sign-in on a fresh instance wins. Reset ownership from the console: `npm run create-owner -- --email you@example.com --force`. Next time set `OPENGSC_OWNER_EMAIL` before exposing a fresh instance.
</details>

## Data

<details>
<summary><b>Dashboard shows no sites</b></summary>

1. **Settings → My Google Accounts**: is the account connected with **GSC ✓**? If not, **Reconnect**.
2. Does that Google account have the properties in Search Console?
3. Press **Sync Data** and watch `pm2 logs opengsc` for `[GSC Sync]` lines.
</details>

<details>
<summary><b>Google accounts disconnect about once a week</b></summary>

Your OAuth app's publishing status is **Testing**, where Google refresh tokens expire after 7 days. Publish the app (Audience → **Publish app**) and reconnect the accounts once. See [Google Cloud Setup](Google-Cloud-Setup#testing-vs-in-production-read-this).
</details>

<details>
<summary><b>Data is two days behind</b></summary>

Normal. Search Console publishes a day's data about two days later. Comparisons use complete days only.
</details>

<details>
<summary><b>Data doesn't update by itself</b></summary>

Automatic sync is **off by default**. Turn it on in **Settings → Sync**.
</details>

<details>
<summary><b>"Table not available", <code>notMigrated</code>, "run prisma db push"</b></summary>

The code was updated but the database schema wasn't. Run:

```bash
cd /root/opengsc && npx prisma db push && pm2 restart opengsc
```

`update.sh` and the UI updater do this automatically. A bare `git pull` doesn't.
</details>

<details>
<summary><b>The database "disappeared" after a restart</b></summary>

`DATABASE_URL` is relative and resolved against a different working directory. Use an absolute path: `file:/root/opengsc/data/prod.db`. The old file is usually still there; find it with `find / -name "*.db" -path "*opengsc*" 2>/dev/null`.
</details>

## Install, build and update

<details>
<summary><b>Build ends with a bare <code>Killed</code></b></summary>

Out of memory. The build needs about 2.4 GB. Add swap and retry ([Installation → Memory and swap](Installation#memory-and-swap)). `install.sh` and `update.sh` add swap themselves; manual builds don't.
</details>

<details>
<summary><b>Build fails on the first stylesheet / Tailwind / TypeScript missing</b></summary>

Dependencies were installed without dev packages (PM2 sets `NODE_ENV=production`). Use `npm i --include=dev`, then `npm run build`.
</details>

<details>
<summary><b>Changes don't appear after <code>git pull</code></b></summary>

The running app is the old build. Rebuild: `npm i --include=dev && npx prisma db push && npm run build && pm2 restart opengsc`. Better: `bash update.sh`.
</details>

<details>
<summary><b>Update hangs at "backing up SQLite"</b></summary>

The database has grown, usually because of raw indexer logs. Run `node scripts/rollup-logs.ts` (deletes raw `IndexerLog` rows except the latest 5,000; charts are kept), then update again. See [Updating](Updating-and-Backups#when-an-update-hangs-or-fails).
</details>

<details>
<summary><b>The update failed. Is the app broken?</b></summary>

`update.sh` rolls back on failure: previous commit, previous dependencies, previous build, app started again. The log names the failing step. If it says *"no previous build to restore — the app stays STOPPED"*, fix the cause (often memory or disk) and run `bash update.sh` again.
</details>

<details>
<summary><b>Nginx shows <code>502 Bad Gateway</code></b></summary>

The app isn't running. `pm2 status`; if `opengsc` is stopped or errored, `pm2 logs opengsc` shows why, then `pm2 restart opengsc`. Mid-update this is expected for a few minutes.
</details>

<details>
<summary><b>Other PM2 apps on the server stopped during an update</b></summary>

Set `PM2_PROC_NAME=opengsc` in `.env` so the updater stops only OpenGSC.
</details>

## Integrations

<details>
<summary><b>GA4 tab empty or erroring</b></summary>

| Error | Fix |
|---|---|
| `… API has not been used in project … or it is disabled` | Enable Analytics **Data** API and **Admin** API in the OAuth client's project |
| `insufficient authentication scopes` | Reconnect the account until it shows **GA4 ✓** |
| Empty property list | Give the account Viewer access to the property in Google Analytics |
</details>

<details>
<summary><b>Health checks: Safe Browsing / PageSpeed errors</b></summary>

Usually key restrictions. Server-side calls have no referer, so don't use "Websites" restrictions, and include IPv6 if you restrict by IP. See [Health check keys](Site-Audit-Health-Uptime#health-check-keys).
</details>

<details>
<summary><b>AI generation fails (<code>generation_failed</code>)</b></summary>

Open the job in **SEO Tools → History**: the error carries the provider's reason (invalid key, quota exhausted, context too long, content-policy rejection). Also `[LLM]` lines in `pm2 logs opengsc`.
</details>

<details>
<summary><b>Backlink or metrics provider returns 503 / 429</b></summary>

`429` is rate limiting; OpenGSC queues and retries. A persistent `503` from a **reseller gateway** is the gateway's problem. Check its status, or switch to DataForSEO or Majestic, which are cheap and reliable for link data. Failed requests are logged in **Settings → Provider log**.
</details>

<details>
<summary><b>Bing / Yandex buttons don't appear</b></summary>

The key or token isn't saved, or the page needs a reload. For Bing use the **API Key** method, not OAuth. See [Indexing](Indexing#bing-webmaster-and-yandexwebmaster).
</details>

<details>
<summary><b>A-Parser features say "not configured" or fail</b></summary>

Check the base URL and API password (Settings → SERP & scraping, or `OPENGSC_APARSER_*` in `.env`, which wins). If you changed the password in A-Parser, update it here too. In Docker, `127.0.0.1` is the container; use the host's IP.
</details>

<details>
<summary><b>Uptime says a working site is down (403)</b></summary>

A WAF blocks the checker's User-Agent. Add `403` to the site's accepted codes: `200-399,403`.
</details>

<details>
<summary><b>Notifications don't arrive</b></summary>

Press **Send test** on the channel. Check its event filter. SMTP: Gmail needs an app password; many VPS providers block outbound SMTP. Telegram: message your bot first, then **Detect chat id**.
</details>

<details>
<summary><b>MCP client can't connect</b></summary>

See [MCP Server → Troubleshooting](MCP-Server#troubleshooting). For Claude Desktop, put `?token=…` on the URL and leave Advanced settings empty.
</details>

<details>
<summary><b>Browser extension: <code>403 origin_not_allowed</code></b></summary>

Copy the extension ID into **Settings → Integrations → Browser extension → Allowed extension IDs**.
</details>

<details>
<summary><b>Auditing a local/staging site is refused</b></summary>

Private addresses are blocked by default (SSRF protection). Set `OPENGSC_ALLOW_PRIVATE_TARGETS=1` in `.env`.
</details>

## Still stuck?

Open an [issue](https://github.com/fenjo26/OpenGSC/issues) with your version (bottom of the user menu), what you did, what you expected, and a `pm2 logs opengsc` excerpt. Remove keys and e-mails from the logs first.
