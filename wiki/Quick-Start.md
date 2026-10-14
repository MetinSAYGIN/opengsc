# Quick Start

From an empty server to a dashboard showing your Search Console data. Allow about 15 minutes, most of it in Google Cloud Console.

## What you need before you start

- **A VPS** running Ubuntu 22.04 or 24.04 with root access. 1 vCPU / 1 GB RAM is the minimum; 2 vCPU / 2 GB is recommended. The installer adds swap if you're short on memory (see [Installation](Installation#memory-and-swap)).
- **A domain or subdomain** pointed at the server's IP, e.g. `gsc.example.com`. **Google sign-in doesn't work against a bare IP address**, so this isn't optional for a server you reach over the internet.
- **A Google account** that has your sites in Search Console.

## Step 1: Point your domain at the server

Create an `A` record (and `AAAA` if you use IPv6) for your domain pointing at the VPS IP. Wait until `ping gsc.example.com` resolves to the right address. Let's Encrypt can't issue a certificate before DNS resolves.

## Step 2: Create the Google OAuth app

Follow **[Google Cloud Setup](Google-Cloud-Setup)**. In short:

1. Create a Google Cloud project.
2. Enable the **Search Console API** (and, if you want GA4, the **Analytics Data API** and **Analytics Admin API**).
3. Configure the consent screen as **External** and add yourself under **Test users**.
4. Create an **OAuth client ID** of type **Web application** with:
   - Authorized JavaScript origin: `https://gsc.example.com`
   - Authorized redirect URI: `https://gsc.example.com/api/auth/callback/google`
5. Keep the **Client ID** and **Client Secret** handy.

## Step 3: Run the installer

SSH into the server as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/fenjo26/opengsc/main/install.sh | sudo bash
```

It asks for:

| Prompt | Answer |
|---|---|
| Domain or server IP | `gsc.example.com` |
| Install Nginx reverse proxy? | **Y** |
| Setup SSL with Let's Encrypt? | **Y** (only works once DNS resolves) |
| Email for SSL certificate | your email |
| Google Client ID / Secret | from Step 2 |

The installer then puts Node.js 24, PM2, Nginx, Certbot and a UFW firewall on the server, clones the app into `/root/opengsc`, writes `.env`, builds the app and starts it under PM2 as `opengsc`. On a small server the build takes several minutes.

> If you answer **N** to SSL, `NEXTAUTH_URL` is written as `http://…`. The redirect URI in Google Cloud then has to be `http://…` as well. The two must match exactly. HTTPS is strongly recommended, and push notifications and the PWA need it.

## Step 4: Sign in and become the owner

Open `https://gsc.example.com` and click **Sign in with Google**. **The first account that signs in on a fresh instance becomes the owner.**

If the server is reachable from the internet before you sign in, someone else could get there first. To lock it down, either:

- set `OPENGSC_OWNER_EMAIL="you@gmail.com"` in `/root/opengsc/.env` and run `pm2 restart opengsc --update-env` before you sign in, or
- create the owner from the console instead: `cd /root/opengsc && npm run create-owner -- --email you@example.com` (it prints a generated password).

Details: [First Login, Accounts and Team](First-Login-and-Team).

## Step 5: Set a password

Go to **Settings → Team Members → Your password** and set one. After that you sign in with email and password. Google stops being a login method and becomes only a data connection. This keeps random Google accounts from even trying the door.

## Step 6: Get your data in

1. **Settings → My Google Accounts**: the account you signed in with is already connected. Add more Google accounts here if your sites are spread over several. Every site from every account appears on the dashboard.
2. Back on the dashboard, press **Sync Data**. The first sync pulls the history Search Console holds for each property, so give it a few minutes on a large portfolio.
3. **Settings → Sync**: turn on **Sync automatically every day** and pick the hour and time zone. **Automatic sync is off by default.** Without it, data only updates when someone presses Sync.

Search Console publishes data with a delay of about two days, so the newest date you'll see is the day before yesterday. That's normal.

## Step 7: Optional, in order of usefulness

| Want this | Do this | Page |
|---|---|---|
| Alerts and digests on your phone | Add a Telegram bot or another channel in **Settings → Notifications** | [Notifications](Notifications) |
| Index status checked automatically | Site → **Indexing** → enable *Automatic index checks* (free Google quota) | [Indexing](Indexing) |
| Uptime monitoring | Already on for every site; tune it in **Settings → Uptime** | [Site Audit, Health and Uptime](Site-Audit-Health-Uptime) |
| A technical audit | Site → **Audit** → run (free, crawls from your server) | [Site Audit, Health and Uptime](Site-Audit-Health-Uptime) |
| Bing / Yandex data | Add a Bing API key / Yandex OAuth token in Settings | [Indexing](Indexing#bing-webmaster-and-yandexwebmaster) |
| GA4 numbers on site pages | Enable the GA4 APIs, reconnect the account, link a property | [Google Cloud Setup](Google-Cloud-Setup#google-analytics-4) |
| AI content tools | Add an AI key in **Settings → AI models** | [AI Providers and Models](AI-Providers-and-Models) |
| Rank tracking | Add a SERP key (Serper is the cheapest start) | [Rank Tracker](Rank-Tracker) |
| Let Claude / Cursor read your data | **Settings → Integrations** → generate an MCP token | [MCP Server](MCP-Server) |
| Nightly offsite backups | **Settings → Backups** | [Updating and Backups](Updating-and-Backups) |

Not sure what costs money? See **[What Needs What](What-Needs-What)**.
