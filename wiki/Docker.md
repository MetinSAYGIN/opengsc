# Docker

An alternative to the VPS installer, for local use, a NAS, or a server that already runs Docker. The app is identical; only process management differs (Docker instead of PM2 + Nginx).

## Prerequisites

- Docker with the Compose plugin.
- A Google OAuth client: [Google Cloud Setup](Google-Cloud-Setup). For purely local use, `http://localhost:3000` is accepted as origin and `http://localhost:3000/api/auth/callback/google` as redirect URI.
- **Real memory for the build.** The image build compiles with Turbopack, which peaks around 2.4 GB, and a container can't add swap. On Docker Desktop, check the VM's memory allocation. The running container is much lighter; a 1 GB limit is fine once built.

## Quick start

```bash
git clone https://github.com/fenjo26/opengsc.git
cd opengsc
cp .env.template .env
nano .env       # set NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose up -d --build
```

Open `http://localhost:3000` (or your `NEXTAUTH_URL`) and sign in. See [First Login, Accounts and Team](First-Login-and-Team).

Generate the secret with `openssl rand -base64 32`.

## How the container behaves

- **`DATABASE_URL` in `.env` is ignored.** The SQLite file always lives at `/data/prod.db` on the `opengsc-data` named volume, so it survives rebuilds and updates.
- The container runs `prisma db push` on every start, so schema changes are applied automatically after an update.
- `PORT=8080 docker compose up -d` changes the host port.
- Find the data on the host: `docker volume inspect opengsc_opengsc-data`.

## Updating

```bash
git pull
docker compose up -d --build
```

The in-app **Update** button is designed for the PM2 install. With Docker, update from the host as above.

## Reverse proxy and SSL

For anything internet-facing, put a reverse proxy in front and point `NEXTAUTH_URL` at the public HTTPS URL. Caddy example:

```
gsc.example.com {
    reverse_proxy localhost:3000
}
```

`NEXTAUTH_URL` must exactly match the redirect URI in Google Cloud (`https://gsc.example.com/api/auth/callback/google`), including the scheme.

## Railway, Fly.io and other platforms

The image keeps all state in `/data/prod.db` and **deliberately declares no Docker `VOLUME`**. Attach a persistent volume at `/data` through the platform (Railway: service → Volumes → mount path `/data`). Without it, the database lives in the container's writable layer and is **wiped on every redeploy**.

## Backups

Everything is one SQLite file:

```bash
docker compose cp opengsc:/data/prod.db ./backup-$(date +%F).db
```

Scheduled encrypted backups from **Settings → Backups** also work in Docker. See [Updating and Backups](Updating-and-Backups#scheduled-backups).

## Talking to services on the host

Inside the container, `127.0.0.1` is the container itself. To reach something on the host (an A-Parser instance, say), use the host's LAN IP or `host.docker.internal`.

## Troubleshooting

- **`redirect_uri_mismatch`**: `NEXTAUTH_URL` doesn't match the redirect URI in Google Cloud.
- **Restarts in a loop**: `docker compose logs opengsc`. The usual cause is a malformed `.env`; a missing `NEXTAUTH_SECRET` is fatal.
- **Build killed**: not enough memory for the build stage, see above.
