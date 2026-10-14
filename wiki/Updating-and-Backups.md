# Updating and Backups

## Updating

OpenGSC ships continuously on `main`. There are three ways to update; all of them run the same `update.sh`.

### From the UI (easiest)

When a newer commit is on `main`, a **"New version available"** bar appears at the top of the dashboard (owner only). Click **Update → Start update**. OpenGSC runs the upgrade on the server and streams the log live. When it's done it asks you to reload the page.

The app is offline for the build window, usually a few minutes on a small VPS. Don't restart the server while it runs.

### From SSH

```bash
cd /root/opengsc
bash update.sh
```

### What `update.sh` does

1. `git fetch origin`.
2. **Backs up the SQLite database** to `data/backups/opengsc-before-update-<stamp>.db` before touching anything (`VACUUM INTO` + integrity check; keeps the last `OPENGSC_BACKUPS_KEEP`, default 3).
3. `git reset --hard origin/main`. Local edits to tracked files are discarded, which is why the database and `.env` live outside git's reach.
4. `npm i --include=dev`. Plain `npm install` skips Tailwind/TypeScript when PM2 sets `NODE_ENV=production`, and the build then fails on the first stylesheet.
5. `npx prisma db push`: applies schema changes. OpenGSC uses `db push`, not migrations.
6. Ensures swap, stops the app, moves the current build aside, runs `npm run build`.
7. Restarts the PM2 process.

**If any step fails, it rolls back**: code goes back to the previous commit, dependencies are reinstalled, the previous build is restored and the old version is started again. The log names the step that failed.

### Updating by hand

If `update.sh` is unavailable or you want full control:

```bash
cd /root/opengsc
git fetch origin
node scripts/backup-sqlite.mjs
git reset --hard origin/main
npm i --include=dev
npx prisma db push
npm run build
pm2 restart opengsc --update-env
```

`git pull && pm2 restart` alone is **not** enough. Without `npm run build` the old build keeps running, and without `prisma db push` new features report "table not available" or `notMigrated`.

### Docker

`git pull && docker compose up -d --build`. The UI update button refuses on non-git installs. See [Docker](Docker#updating).

### When an update hangs or fails

- **Stuck at the backup step for minutes**: the database has grown, usually because raw indexer logs (`IndexerLog`) are never rolled up automatically. The backup has a 10-minute ceiling. Roll the logs up, then retry:
  ```bash
  cd /root/opengsc && node scripts/rollup-logs.ts
  ```
  ⚠️ This permanently deletes raw `IndexerLog` rows except the latest 5,000. Daily aggregates (`IndexerDailyStat`) and the charts are kept.
- **`Killed` during build**: out of memory, see [Installation → Memory and swap](Installation#memory-and-swap).
- **Disk full**: `df -h`. Old backups in `data/backups/`, PM2 logs (`pm2 flush`) and `.next.prev` are the usual suspects.
- After a failed update, `pm2 logs opengsc` and the update log in the UI show the failing command.

## Scheduled backups

Updates back up the database before they touch anything. **Settings → Backups** (owner only) covers everything that happens between updates.

- **Schedule**: a cron expression in UTC (e.g. `0 3 * * *`), plus a **Back up now** button. Each run takes a consistent snapshot of the live database (`VACUUM INTO` + `integrity_check`, in a worker thread so the app stays responsive), optionally gzips and encrypts it, and records the run. Free disk space is checked first. A failed night notifies you; the next scheduled run retries. Nothing back-fills.
- **Retention**: 1–90 days (7/14/30 presets), applied locally and on the SFTP destination. The newest backup always survives, so an instance that was down for a month still has its last copy.
- **SFTP upload** to your own NAS or server, with two hard requirements:
  1. the backup must be **encrypted** (the database holds your provider keys, SMTP passwords and the SFTP credentials themselves);
  2. the destination's **host key must be pinned**. **Test connection** checks that the destination is writable and returns its SHA256 fingerprint (the same string `ssh-keygen -lf` prints). **Save** pins it. A different key later is refused.
  Uploads go to a `.part` file and are renamed into place, so a killed transfer never leaves a truncated file under a valid name.
- **Encryption**: AES-256-CBC in the standard `openssl enc` format (PBKDF2-SHA256, 200,000 iterations). Any OpenSSL ≥ 1.1.1 decrypts it.
- **`.env` copy** (optional): travels with each backup. It's only uploaded offsite when encryption is on.
- **Failure alerts** go to your notification channels under the **Backups** event. Add that event to a channel in **Settings → Notifications**.

Files land in `data/backups/` next to the database, named `opengsc-scheduled-<stamp>.db[.gz][.enc]`.

> ⚠️ **Write the passphrase down** in your password manager when you set it. It's stored only inside the database, and the database is inside the encrypted backups. Without it nobody can decrypt them, including you.

Automatic backups are SQLite-only. On MySQL/MariaDB, use the database's own tools (`mysqldump`, snapshots).

## Restoring

Restore is deliberately a manual operator action. A running app never swaps its own database.

```bash
pm2 stop opengsc
cd /root/opengsc/data

# 1. Move the old write-ahead log out of the way. A leftover WAL would be applied
#    to the restored file and corrupt it.
mv prod.db-wal prod.db-wal.old 2>/dev/null; mv prod.db-shm prod.db-shm.old 2>/dev/null

# 2. Decrypt / unpack if needed (the passphrase is read from stdin)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -in backups/opengsc-scheduled-XXXX.db.gz.enc -pass stdin | gunzip > restored.db

# 3. Replace the database
mv prod.db prod.db.broken && mv restored.db prod.db

pm2 start opengsc
```

For a plain `.db` backup, skip step 2 and copy it over `prod.db`.

## Moving to a new server or domain

1. On the old server: back up (`node scripts/backup-sqlite.mjs` or **Back up now**) and copy `data/prod.db` and `.env`.
2. On the new server: run the installer, stop the app, put `prod.db` into `data/` and restore the relevant `.env` values. Keep `NEXTAUTH_SECRET` (and `CONTENT_OPS_SECRET`) the same, or saved GitHub tokens become unreadable.
3. **New domain:** update `NEXTAUTH_URL`, and in Google Cloud add the new JavaScript origin and redirect URI. Then `pm2 restart opengsc --update-env`. Re-issue anything that embeds the old URL: the indexer script, the audit widget embed code, the browser extension's instance URL and MCP client configs.
