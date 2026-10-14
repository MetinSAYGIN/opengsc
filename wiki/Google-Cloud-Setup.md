# Google Cloud Setup

OpenGSC reads Search Console (and optionally GA4) through **your own** Google OAuth app. No shared app sits in the middle and your data doesn't pass through anyone else's server. The price is a one-time setup in Google Cloud Console, about 5 minutes.

Use the Google account that owns (or has access to) your Search Console properties.

## 1. Create a project

[console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate). Any name works, e.g. `opengsc`. **Keep this project selected** in the top bar for every step below. Most "API not enabled" errors come from enabling an API in a different project than the one holding the OAuth client.

## 2. Enable the APIs

| API | Needed for | Link |
|---|---|---|
| Google Search Console API | Everything, required | [enable](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) |
| Google Analytics Data API | GA4 tab (optional) | [enable](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com) |
| Google Analytics Admin API | GA4 property list (optional) | [enable](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com) |
| Safe Browsing API | Health tab (optional, API key, not OAuth) | see [Site Audit, Health and Uptime](Site-Audit-Health-Uptime#health-check-keys) |
| PageSpeed Insights API | Core Web Vitals (optional, API key) | same page |

APIs are enabled per **project**, not per account. Enabling them once covers every Google account you connect later. Allow 1–2 minutes to propagate.

## 3. Configure the consent screen

1. [console.cloud.google.com/auth/branding](https://console.cloud.google.com/auth/branding): choose **External**, enter an app name and your e-mail. Defaults are fine everywhere else.
2. [console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience): add your Google account, and every other account whose sites you'll connect, under **Test users**.

### Testing vs. In production: read this

While the app's publishing status is **Testing**:

- only accounts listed under *Test users* can connect (others get `access_denied`);
- Google issues refresh tokens that **expire after 7 days** for apps requesting Search Console / Analytics scopes. In practice your Google accounts quietly disconnect every week and syncs stop until you reconnect them.

For a long-running instance, press **Publish app** on the Audience page to move it to **In production**. You don't need Google's verification for a self-hosted tool. The consent screen will say *"Google hasn't verified this app"*. Click **Advanced → Go to (app name)**. You're the developer, so that warning is about you.

## 4. Create the OAuth client

[console.cloud.google.com/auth/clients/create](https://console.cloud.google.com/auth/clients/create) (also reachable via **APIs & Services → Credentials → Create credentials → OAuth client ID**).

- **Application type:** Web application
- **Authorized JavaScript origins:** `https://your-domain.com`
- **Authorized redirect URIs:** `https://your-domain.com/api/auth/callback/google`

Copy the **Client ID** and **Client Secret**. The installer asks for both. They end up in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Rules that cause most login problems:

- The redirect URI must match `NEXTAUTH_URL` from `.env` **exactly**: same scheme (`https` vs `http`), same host, no trailing slash, plus `/api/auth/callback/google`.
- Bare IP addresses are rejected by Google. The only exception is `http://localhost` for local testing.
- Changing your domain later means updating the origin and redirect URI here **and** `NEXTAUTH_URL` in `.env`, then `pm2 restart opengsc --update-env`.

## What OpenGSC asks Google for

The sign-in requests these scopes: `openid email profile`, `webmasters.readonly` (Search Console, read-only) and `analytics.readonly` (GA4, read-only). OpenGSC can't change anything in your Search Console or Analytics through this grant.

Google Business Profile uses a **separate** grant (`business.manage`) that you connect from the Local module. See [Local SEO](Local-SEO#google-business-profile).

## Google Analytics 4

GA4 is optional. The dashboard and GSC work without it.

1. Enable the **Analytics Data API** and **Analytics Admin API** (step 2) in the same project as the OAuth client.
2. **Reconnect** the Google account under **Settings → My Google Accounts** so its token picks up the `analytics.readonly` scope. On a fresh install the scope is requested at first sign-in, so this only matters for accounts connected under an older version. A connected account shows **GSC ✓** and **GA4 ✓** badges.
3. Make sure that Google account has at least **Viewer** access to the GA4 property itself (Google Analytics → Admin → **Property Access Management**). Cloud Console access and property access are different things.
4. Open the site → **GA4** tab → pick the property → **Link Property**. The link is per site; **Unlink GA4** removes it without deleting anything.

The tab shows sessions, engagement rate, key events and revenue, each with a delta against the previous period of the same length.

| Error | Fix |
|---|---|
| `... API has not been used in project ... or it is disabled` | Enable the Data API **and** Admin API in the right project, wait 1–2 minutes |
| `insufficient authentication scopes` | Reconnect the account in Settings until it shows **GA4 ✓** |
| Property list is empty | The account has no access to that property; add it in Property Access Management |
| `PERMISSION_DENIED` when linking | Same as above |

## Microsoft Clarity

Optional and free. It isn't a Google product, but it lives next to GA4 on the site page.

1. Sign up at [clarity.microsoft.com](https://clarity.microsoft.com), create a project and install its tracking script on your site. Wait 1–3 days for data.
2. In Clarity: **Settings → Data Export → Generate new API token**.
3. In OpenGSC: site → **UX / Clarity** tab → paste the token and the Project ID → **Save** → **Load data**.
4. Optional: set **Auto-collect → Daily**. Clarity's export API only returns recent days, so OpenGSC fetches once a day and accumulates up to 30 days.

The tab shows dead clicks, rage clicks, scroll depth and problem pages. With an AI key configured, it can also write a UX report from that data.
