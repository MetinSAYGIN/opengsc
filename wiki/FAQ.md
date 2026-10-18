# FAQ

**Is OpenGSC really free?**
Yes, MIT-licensed. You pay for the VPS (a ~$5/month one works) and for any third-party APIs you choose to use. No markup, no subscription. See [What Needs What](What-Needs-What).

**Does my Search Console data go to anyone else?**
No. You use your own Google OAuth app, the data is stored in your own SQLite file, and API calls go directly from your server to the provider.

**Can I run it without a domain?**
Only for local testing (`http://localhost:3000`, or an SSH tunnel). Google OAuth rejects bare IP addresses.

**How many sites and Google accounts can I connect?**
No limit. Connect as many Google accounts as you have; every property appears on the dashboard.

**Can several people use one instance?**
Yes: invite members as **viewer**, **editor** or **admin** in Settings → Team Members. They sign in with e-mail and password, never with their own Google accounts. One instance is one workspace with one owner. For unrelated clients who each want their own data and keys, run separate instances. See [First Login and Team](First-Login-and-Team).

**Is there a white-label option?**
Client reports are white-label (your logo, colours, footer; "Powered by" is off by default), and share links show one site only. The app UI itself isn't rebranded.

**Why is the newest data two days old?**
Search Console publishes data with a delay of about two days.

**Why doesn't data update on its own?**
Daily automatic sync is off by default: **Settings → Sync**.

**How do I update?**
Click **Update** in the bar that appears when a new version is out, or run `bash update.sh`. See [Updating and Backups](Updating-and-Backups).

**Will an update delete my data?**
No. The database lives in `data/` (ignored by git), and every update backs it up first. If an update fails it rolls back.

**Can I use MySQL / PostgreSQL instead of SQLite?**
SQLite is the supported database. MySQL/MariaDB work as an experimental port (set a `mysql://` `DATABASE_URL`). PostgreSQL isn't supported.

**Can I run it in Docker?**
Yes. See [Docker](Docker).

**Which AI provider should I use?**
Any you have a key for. Each task can use a different model: an expensive one for article text, a cheap one for utility passes, a *different* one for the QA judge. See [AI Providers and Models](AI-Providers-and-Models).

**Which SERP provider is cheapest?**
Serper.dev for a quick start (~$0.30–1 per 1,000). A-Parser if you already run it, since you pay only for proxies. DataForSEO if you also want Demand, AI Overviews and LLM Mentions on one credential.

**Do I need Ahrefs?**
No. Every metrics feature also works with a free CSV export import, and Majestic, DataForSEO or Keys.so can replace it for links. See [SEO Metrics Providers](SEO-Metrics-Providers).

**Is anything charged automatically in the background?**
Only what you turn on. Tracked keywords in the Rank Tracker are re-checked about daily while a SERP key is configured. Automatic AEO checks, sentiment assessment, weekly backlink refreshes and scheduled geo-grid presets are opt-in. Every manual paid action shows its price first. The metrics monthly cap is enforced before requests go out.

**Can an AI agent spend my money through MCP?**
Not by accident: paid tools refuse to run without `confirm: true`, viewer/editor tokens can't spend at all, and link purchases aren't exposed over MCP.

**Is the Private Indexer safe to use?**
It implements doorways and cloaking, which break search-engine guidelines and can get domains deindexed. It's off until you set it up. Use only domains you can afford to lose. See [Private Indexer Network](Indexer-Network).

**Does URL Inspection make Google index my page?**
No. It reports what Google knows. To ask for crawling use sitemaps / Search Console, or IndexNow for Bing and Yandex.

**Which languages does the interface support?**
English, Russian, Ukrainian, French, Spanish, German, Simplified Chinese and Dutch. Alerts and digests follow your chosen language, and each client report can have its own.

**Where do I report a bug or ask for a feature?**
[GitHub Issues](https://github.com/fenjo26/OpenGSC/issues).
