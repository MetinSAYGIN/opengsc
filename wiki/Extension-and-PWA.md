# Browser Extension and Mobile App

## Browser extension (Chrome / Edge)

A Manifest V3 extension in the repository's [`extension/`](https://github.com/fenjo26/OpenGSC/tree/main/extension) folder. It's **not in the Chrome Web Store** by design: it talks to *your* self-hosted instance, so there's nothing for a store to sign.

### What it does

- **This page in OpenGSC**: for any URL of your portfolio: clicks, impressions and average position (28 days), top queries, index status, audit issues for that URL, tracked-keyword positions, and an "open in OpenGSC" link.
- **Quick audit** computed **inside the extension** from the tab's DOM: title/description lengths (the app's limits), H1, canonical, robots, hreflang, JSON-LD validity, Open Graph, link count, images without alt. Nothing leaves the browser.
- **Send to OpenGSC** (context menu or popup):
  - your own URL → **priority in the automatic index check** (checked on the next scheduler tick, from the free URL Inspection quota);
  - someone else's URL → an **Outreach prospect**;
  - selected text → opens the Outline Generator with it as the keyword;
  - a selection inside a `<table>` → downloads a **CSV**.

### Installing

1. Get the folder: clone the repo, or zip it: `cd extension && zip -r ../opengsc-extension.zip .`
2. Open `chrome://extensions` (Edge: `edge://extensions`) → enable **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. In OpenGSC: **Settings → Integrations → Browser extension → Create token**. It's separate from the MCP token. Re-issuing it revokes the old one instantly.
4. Right-click the extension icon → **Options**: your instance URL (`https://gsc.example.com`) and the token → **Save** (Chrome asks for permission to that one origin) → **Test connection**.
5. Copy the **extension ID** (32 characters, shown on the extension's page) into **Settings → Integrations → Browser extension → Allowed extension IDs**. Without this the server answers `403 origin_not_allowed`. The ID stays stable as long as you load from the same folder.

### Privacy and permissions

It only sends what you click: the current URL (and selected text for prospects), plus the token. No browsing history. Permissions are `activeTab`, `contextMenus`, `storage` and `scripting`, plus an optional host permission for **your instance's origin only**. The extension can't call anything that costs money. Rate limit: 60 requests per minute per token. A viewer's token can read but can't queue.

Extension UI languages: English and Russian (follows the browser).

## Installing OpenGSC as an app (PWA)

OpenGSC installs on phones and desktops as an app, and the dashboard stays readable offline with the last loaded data.

- **Android / Chrome / Edge**: an **Install app** button appears on the dashboard or in Settings.
- **iPhone / iPad** (iOS 16.4+): Safari → **Share → Add to Home Screen**, then open it from the icon.

**HTTPS is required** for the service worker and push. On `http://` the UI explains why instead of showing buttons.

Offline, only the dashboard summary is cached, and a banner says "No network — data from <time>". Other API calls are never cached.

## Push notifications

A notification channel of its own, so you don't need Telegram.

1. **Settings → Notifications → Push notifications → Enable on this device**, and allow the browser prompt. On iOS do this from the installed home-screen app.
2. Each device has its **own event filter** (empty = all): alerts, digest, uptime, indexing, mentions, leads, local pack, trends. Every member's devices receive independently.
3. **Send test** delivers to all devices in the workspace.
4. Tapping a notification opens the related screen (a site alert opens that site, a lead opens `/leads`).

VAPID keys are generated automatically on first use and stored in your database. To share keys across instances, set `OPENGSC_VAPID_PUBLIC_KEY`, `OPENGSC_VAPID_PRIVATE_KEY` and `OPENGSC_VAPID_SUBJECT` (generate a pair with `npx web-push generate-vapid-keys`).

Dead subscriptions (uninstalled app, cleared browser data) are removed automatically.
