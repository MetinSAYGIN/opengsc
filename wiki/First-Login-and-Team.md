# First Login, Accounts and Team

OpenGSC keeps two things apart that most tools mix up:

- **Who can sign in**: an e-mail and a password (after first setup).
- **Where the data comes from**: Google accounts you connect as *data sources* for Search Console and Analytics.

One instance is **one workspace with one owner**. The owner connects Google accounts and pays for every API key. Team members work inside that workspace with a role. There's no multi-tenancy: if two unrelated people want their own data, they run two instances.

## Becoming the owner

On a fresh instance there are two ways to create the owner.

**A. Sign in with Google (the default).** The first Google account that signs in becomes the owner. If the instance is on the internet before you sign in, restrict who may claim it:

```bash
# /root/opengsc/.env
OPENGSC_OWNER_EMAIL="you@gmail.com"        # comma-separated for several
```

then `pm2 restart opengsc --update-env`.

**B. Create the owner from the console**, with no Google involved:

```bash
cd /root/opengsc
npm run create-owner -- --email you@example.com                     # prints a generated password
npm run create-owner -- --email you@example.com --password 'long passphrase'
```

On an instance that already has an owner the script refuses, unless you add `--force` (which resets the existing owner). After signing in with the password, connect your Google account in **Settings → My Google Accounts**.

## Set a password and close the Google door

**Settings → Team Members → Your password.** Once the owner has a password:

- you sign in with e-mail + password;
- Google stops being a login method and is used only to **connect data accounts** from inside a signed-in session;
- a Google account that isn't the owner's is refused at the login page instead of being quietly attached.

To reopen Google login (for example after losing the password), set `OPENGSC_ALLOW_GOOGLE_LOGIN=true` in `.env` and restart.

### Forgot the password?

From the server console:

```bash
cd /root/opengsc
npm run set-password -- --email you@example.com                  # generates one
npm run set-password -- --email you@example.com --password '...'
```

This works for any account on the instance, members included. Console access is the authority here: anyone with it could read the database anyway.

Failed logins are rate-limited per e-mail and per IP over a 15-minute window.

## Connecting Google accounts (data sources)

**Settings → My Google Accounts → Add.** Every Search Console property of every connected account appears on the dashboard. Add as many accounts as you have.

- Each account shows **GSC ✓** and, if Analytics is granted, **GA4 ✓**.
- **Reconnect** an account when its badge is missing, when Google revoked the token, or after enabling the GA4 APIs.
- If accounts keep disconnecting about once a week, your OAuth app is still in *Testing* mode. See [Google Cloud Setup](Google-Cloud-Setup#testing-vs-in-production-read-this).
- Removing an account removes its connection. Data already synced stays until you delete the sites.

Bing Webmaster and Yandex.Webmaster are connected separately, with keys/tokens. See [Indexing](Indexing#bing-webmaster-and-yandexwebmaster).

## Team members and roles

**Settings → Team Members → Add a member.** Members sign in with e-mail and password and **never connect a Google account of their own**, so nobody's personal properties leak into the workspace.

| Role | Can do |
|---|---|
| **Viewer** | Read every dashboard, report and export. Changes nothing. |
| **Editor** | Viewer + free actions (audits, syncs, deterministic analysis) + edit content, outreach, tags, annotations. **Can't spend money.** |
| **Admin** | Editor + **spend the owner's credits** (AI generation, keyword research, SERP checks, indexer submissions), create GitHub pull requests, manage members. |
| **Owner** | Everything, plus API keys, Google connections, MCP tokens, the update button and deleting sites. Can't be removed or demoted. |

Two ways to add someone:

- **Set a password now**: you set it and pass it on. They must change it at first sign-in, so your copy stops working.
- **Send an invite link**: single-use, valid for 72 hours. They choose their own password.

The secret is shown once. If it's lost, issue a new one. Members can be **suspended** (can't sign in, history kept) or **removed**. A suspended member's MCP token stops working on the next call.

## Workspace preferences

**Settings → Preferences**: interface language (also on the login screen), chart style and client-report branding. Telegram/Slack alerts and digests are sent in the language you choose.

Supported languages: English, Русский, Українська, Français, Español, Deutsch, 简体中文, Nederlands.
