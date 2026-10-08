# Social Scheduler

A local-first social media scheduler (Buffer/Postiz style) for **Mastodon** and **Bluesky**.
Compose once, schedule, and a background worker publishes even with the browser closed.

## Prerequisites (Windows)

- **Node 22 LTS** (pinned in Docker; local dev also works on newer Node)
- **pnpm 9**: `corepack enable`
- **Docker Desktop** with the WSL2 backend (for Postgres, and for the all-in-containers mode)
- **ffmpeg** (optional): only needed if you want to generate test videos yourself

## Setup (fresh clone to running app)

```powershell
git clone <repo> social-scheduler
cd social-scheduler
corepack enable
pnpm install
Copy-Item .env.example .env
pnpm gen:key   # paste the output as ENCRYPTION_KEY in .env
docker compose up -d db
pnpm dev
```

Open `http://localhost:4321` (if that port is busy, Astro picks the next free one —
check the terminal; the API then needs that origin in `WEB_ORIGIN`, see below).

What `pnpm dev` starts (via `concurrently`):

| Process | Command | Port |
| ------- | ------- | ---- |
| web | `pnpm --filter web dev` (Astro) | 4321 |
| api | `pnpm --filter server start:api` (Hono + migrations on boot) | 4000 |
| worker | `pnpm --filter server start:worker` (DB poll loop) | — |

## Configuration (`.env`)

| Key | Purpose | Default |
| --- | ------- | ------- |
| `DATABASE_URL` | Postgres connection | `postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler` |
| `ENCRYPTION_KEY` | 32-byte base64 key for credentials at rest (`pnpm gen:key`) | — (required) |
| `PUBLIC_API_URL` | API origin the browser calls | `http://localhost:4000` |
| `WEB_ORIGIN` | Comma-separated allowed CORS origins, e.g. `http://localhost:4321,http://localhost:4322` | `http://localhost:4321` |
| `API_PORT` | API listen port | `4000` |
| `STORAGE_DIR` | Uploaded media directory | `./storage` |
| `MAX_UPLOAD_MB` | Upload size cap | `25` |
| `MOCK_PLATFORMS` | `true` = credential-free mock adapters (smoke tests only) | unset |

The web app needs `PUBLIC_API_URL` too: copy `apps/web/.env.example` to `apps/web/.env`.

## Running modes

1. **Dev** (hot reload): `docker compose up -d db` + `pnpm dev` (above).
2. **Always on** (everything in containers, survives reboots when Docker Desktop
   is set to "Start when you sign in"):
   ```powershell
   docker compose up -d --build
   ```
   Services: `db` (Postgres 16, `pgdata` volume), `api` + `worker` (same image,
   different commands; migrations run on API boot), `web` (Astro standalone).
   All ports bind to `127.0.0.1` only. If the PC sleeps, overdue posts publish
   on wake (or fail with a "grace window" message if you set
   `latePublishGraceMinutes`).

## Connecting accounts

- **Mastodon**: `/accounts` → enter instance (e.g. `mastodon.social`) → Connect →
  approve on the instance → redirected back with the account listed.
- **Bluesky**: `/accounts` → handle + **app password** (Bluesky → Settings →
  Privacy and Security → App passwords). Your password never leaves your browser
  except to Bluesky itself.

## Backups

- Postgres data: the `pgdata` Docker volume.
  ```powershell
  docker compose exec -T db pg_dump -U scheduler scheduler > backup.sql
  ```
- Uploaded media: the `storage/` directory (bind-mounted in compose).
- `.env`: contains `ENCRYPTION_KEY` — without it, stored credentials are
  unreadable. Back it up somewhere safe (it is git-ignored for a reason).

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| CORS error on `/api/...`, preflight 204 | Browser origin not in `WEB_ORIGIN` (Astro shifts to `:4322` when `:4321` is busy). Add it, restart the API. |
| `ENCRYPTION_KEY must decode to 32 bytes` | Generate with `pnpm gen:key` (32-byte base64). |
| `EADDRINUSE :::4000` | Two API processes (e.g. `pnpm dev` + a stray `tsx watch`). Kill the stray process. |
| `localhost:4321` shows another project | Another dev server owns the port (IPv6 `localhost` may differ from `127.0.0.1`). Use the port Astro reports, or `127.0.0.1`. |
| Post stuck `pending` | Worker not running (`pnpm --filter server start:worker`), or account `needs_reauth` (reconnect on `/accounts`). |
| Video upload fails (Bluesky) | Account email must be verified; daily video limits apply. The server log shows the service message. |
| `pnpm exec tsx ...` says "Command tsx not found" | Transient pnpm store contention when several pnpm processes run at once — retry. |
| Styles look unstyled after changing a `css()` call | Dev mode doesn't regenerate `styled-system/styles.css` automatically — run `pnpm --filter web exec panda cssgen` (or restart `pnpm dev`, which runs it via `prepare`). |

## How to add a new platform adapter

1. Implement `PlatformAdapter` (`apps/server/src/platforms/types.ts`):
   `verifyCredentials`, `getLimits`, `validate`, `publish`. Throw
   `PlatformError` with kind `retryable` | `permanent` | `auth` (`auth`
   flips the account to `needs_reauth`).
2. Register it in `createAdapters()` (`apps/server/src/worker/publisher.ts`)
   and add the platform to `platformSchema` (`packages/shared`).
3. Add connect routes in `apps/server/src/api/accounts.ts` (store encrypted
   credentials with `encrypt()`; cache limits in `limits_json`).
4. Add a "Connect …" section on `/accounts` and a `…Preview` component fed by
   `PreviewModel`. Limits/validation live in `packages/shared` so the UI can
   reuse them for counters.

## Scripts

| Command | What |
| ------- | ---- |
| `pnpm dev` / `build` / `lint` / `test` | workspace dev, build, lint, unit tests |
| `pnpm db:generate` / `db:migrate` | generate / apply Drizzle migrations |
| `pnpm gen:key` | new 32-byte base64 `ENCRYPTION_KEY` |
| `pnpm --filter web test:e2e` | headless browser suite (needs dev DB + API; boots web itself) |
| `pnpm --filter web test:e2e:mock` | credential-free connect smoke (own mock API + web, test DB) |

Design notes: `docs/design-system-notes.md`. Build state: `PROGRESS.md`.
