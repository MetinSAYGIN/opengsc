# For Developers

How OpenGSC is put together, and how to work on it without breaking other people's installs.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**. Next.js 16 has breaking changes from earlier versions. Read the guides in `node_modules/next/dist/docs/` before changing framework-level code. Middleware is now `src/proxy.ts`.
- **Prisma 7** + **SQLite** via `@prisma/adapter-better-sqlite3` (MySQL/MariaDB experimental).
- **NextAuth v4**: credentials (email + password, bcrypt) for identity; Google OAuth for data connections.
- Recharts, Tailwind 4, `googleapis`, `nodemailer`, `web-push`, `ssh2`, optional Playwright (PDF reports, Googlebot View headless mode).

## Runtime model

One Next.js process under PM2. No separate backend and no queue broker:

- every server operation is a Route Handler under `src/app/api/**`;
- background AI jobs are fire-and-forget: a `SeoJob` row is created, the work continues in-process, and the client polls. Jobs send a heartbeat; a job silent for 20 minutes is marked failed;
- schedulers (sync, rank, AEO, uptime, index checks, trends, backups, SERP Monitor…) are in-process interval loops started from `instrumentation.ts`. Look for `[rank-cron]`, `[GSC Sync]` and similar prefixes in `pm2 logs`.

Every table is scoped by `userId` (the owner). Team members resolve to `{ ownerId, actorId, role }` through `src/lib/team/workspace.ts`; the permission matrix is `src/lib/team/roles.ts`.

## Map of the code

| Path | What |
|---|---|
| `src/app/page.tsx` | Main dashboard |
| `src/app/site/[id]/page.tsx` | Site page (large file; coordinate before editing) |
| `src/app/settings/page.tsx` | Settings |
| `src/app/seo-tools/**` | AI content suite pages |
| `src/app/api/**` | All route handlers |
| `src/lib/gscSync.ts` | Search Console sync |
| `src/lib/llm.ts` | Multi-provider LLM client |
| `src/lib/seo/generate.ts`, `prompts.ts`, `aiTasks.ts` | Generation pipeline, prompts, per-task model registry |
| `src/lib/mcp/*.ts` | MCP tool registry, split by area |
| `src/lib/audit/` | Site audit crawler and rules |
| `src/lib/notify/` | Notification channels |
| `src/locales/*.json` | UI strings, 8 languages |
| `prisma/schema.prisma` | Data model |
| `extension/` | Browser extension (MV3, no build step) |
| `.agents/skills/` | Agent skills for MCP users |

Architecture in depth: [docs/ARCHITECTURE.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/ARCHITECTURE.md). Roadmap: [docs/PRODUCT-ROADMAP.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/PRODUCT-ROADMAP.md).

## Local development

```bash
git clone https://github.com/fenjo26/opengsc.git && cd opengsc
npm install --include=dev
cp .env.template .env          # DATABASE_URL="file:./data/dev.db", NEXTAUTH_URL="http://localhost:3000"
npx prisma db push
npm run dev
```

Use an OAuth client with `http://localhost:3000` as origin and `http://localhost:3000/api/auth/callback/google` as redirect URI.

## Rules that keep installs safe

**Schema changes ship through `prisma db push`, not migrations.** The updater runs `db push` on every install. Make changes **additive** (new nullable columns, new tables) so an older row set stays valid. Edit `schema.prisma`; the MySQL variant is derived automatically by `prisma.config.ts`. MySQL needs `@db.VarChar(…)` on indexed string columns. Code must degrade when a table or column is missing: return `{ notMigrated: true }` or an empty result with a note, never a 500.

**i18n must stay in lockstep.** `npm run check:i18n` requires identical key sets in all 8 locale files (`en, ru, uk, fr, es, de, zh, nl`). Add every new key to all of them. Alerts and digests render from `src/lib/notifyI18n.ts`, a separate table.

**Never stage a database.** `dev.db` and `prisma/dev.db` are tracked for historical reasons, and a local one usually holds real data. Stage explicit paths, not `git add -A`.

**Paid calls need a price and a confirm.** Anything that spends the owner's credits needs the `spend` capability on the route, a price shown before the call, and `confirm: true` on the MCP side.

**Outbound fetches go through `safeFetch`** (SSRF guard). Public routes (widget, share links) must never read the owner's keys.

## Checks

```bash
npm run check        # i18n keys + eslint + release consistency + unit tests
npx tsc --noEmit
npm run build
```

Unit tests are plain `node:test` via `tsx --test`, listed in the `test:unit` script in `package.json`. **Add new test files to the end of that list**, or they won't run.

## Releases

`package.json` holds the version; README badge, CHANGELOG, Settings and MCP must agree with it. The checklist: [docs/RELEASE-CHECKLIST.md](https://github.com/fenjo26/OpenGSC/blob/main/docs/RELEASE-CHECKLIST.md).

## Editing this wiki

The wiki's source lives in the repository under [`wiki/`](https://github.com/fenjo26/OpenGSC/tree/main/wiki). Change pages there in a pull request. On every push to `main` that touches `wiki/`, the **Publish wiki** workflow mirrors the folder into the GitHub wiki. **Edits made in the wiki UI are overwritten** by the next sync.

- One file per page; the file name is the page name (`Quick-Start.md` → *Quick Start*). `_Sidebar.md` and `_Footer.md` are the navigation.
- Link pages as `[Text](Page-Name)` or `[Text](Page-Name#heading)`, and repository files with full `https://github.com/fenjo26/OpenGSC/blob/main/…` URLs.
- When a feature changes, update its wiki page in the same PR.

## Contributing

Issues and PRs are welcome. For a feature, describe the use case. For a bug, a `pm2 logs opengsc` excerpt or a reproduction is the fastest route to a fix. Licence: MIT.
