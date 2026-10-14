# Publishing and Magic Links

Two sides of the same coin:

- **Publishing**: post **your own** generated articles to WordPress sites.
- **Magic links**: **pay a service** to place posts that link to your pages, straight from striking-distance rows.

Both feed the same backlink pipeline, so every placement is checked and measured the same way.

## Publishing

**Top menu → Research → Publishing** (`/publishing`).

### Connecting a WordPress site

Uses the WordPress REST API with an **application password**. No plugin and no OAuth app.

1. In WordPress: **Users → Profile → Application Passwords** → create one.
2. In OpenGSC `/publishing`: add a connection (site URL, username, application password) and set its **type**:
   - **own satellite**: a site in your network;
   - **money site**: the site you're promoting;
   - **external platform**: someone else's site where you publish.

### Publishing a post

From **SEO Tools → History**, click a text/landing row → **Publish**. Pick connections and optionally **adapt for the platform (AI)**: the *Publish respin* task, one cheap call per platform that changes tone and length while facts, structure and links stay fixed.

Built-in footprint protection:

- **Respin is only allowed for external platforms.** Own satellites each get their own post, because one text respun across your network is a ready-made footprint for Google.
- **Uniqueness gate**: at send time the post is compared against every post already published from this instance (trigram similarity). Near-duplicates are blocked. Paraphrases pass, and the UI says so honestly.
- **Jitter window**: publications spread over a configurable window instead of one batch. A deferred post that hits the gate raises an alert.
- **Pre-publish review** shows the anchor distribution across the network and warns about shared title skeletons or hour-clustering.

Every successful publish **becomes a backlink donor** (`source: self`) in the target site's Backlinks: placement checker, event history and toxicity included. The target is the URL you give, else the first money-site link in the post, else the site root.

## Magic links

**Top menu → Research → Magic links** (`/magiclinks`). Buy paid posts through **FieldLink** or **369Team**.

1. Add the service tokens in **Settings → SERP & scraping → Link purchase** (or `OPENGSC_FIELDLINK_TOKEN` / `OPENGSC_MAGIC369_TOKEN` in `.env`).
2. On a [Potential (striking distance)](Portfolio-Analytics#potential-striking-distance) row, press **Buy**. The query and URL are pre-filled. Select several rows for one order.
3. The buy window **quotes before it charges**. FieldLink re-checks the price when paying, and a moved price returns an error instead of a surprise deduction. The provider with the larger balance is preselected.
4. **Edit each anchor** or use a preset (exact / diluted / URL / domain). A batch of identical exact-match commercial anchors is an over-optimization footprint, so pick deliberately.

Options: articles priced by volume tier (+30% bonus per row) or homepage links at a flat price (+20% bonus, optional surrounding text).

Afterwards:

- Bought query + URL pairs are marked in striking distance.
- `/magiclinks` shows progress, indexing state and a CSV of publication URLs.
- Each order appears as a **purple marker** on the site's traffic chart and annotations, with before/after numbers from your own Search Console data. "Did the links work?" gets a factual answer.

**Purchases are deliberately not available over MCP**: an agent holding a token must not be able to spend your balance.

## MCP

`publish_list_connections`, `publish_list_posts` (free), `publish_post` (paid when AI respin is used; needs `confirm`).
