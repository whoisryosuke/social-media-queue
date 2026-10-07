# Social Scheduler: Build Plan for a Coding Agent

A local-first social media scheduler (Postiz / Buffer style) supporting **Mastodon** and **Bluesky**, built with **Astro + React + Panda CSS + nanostores**, running on a Windows PC at `localhost`.

---

## 0. How to use this document

- Work through the phases **in order**. Each phase has acceptance criteria; do not start the next phase until they pass.
- Keep a `PROGRESS.md` at the repo root. After each phase, record what was done, deviations, and open questions.
- **Mandatory stop points** where you must pause and ask the user:
  1. End of Phase 1 (scaffold complete): ask the user for their **custom Panda CSS preset**.
  2. Before Phase 5 (Bluesky): ask whether they want app-password auth (default) or OAuth.
  3. Any time a platform API behaves differently from what this document says: **verify against current official docs** and note the difference in `PROGRESS.md`. API limits quoted here are accurate as of writing but must be re-checked.
- Prefer small, typed, tested modules. No dead code, no TODO-stubs left behind at the end of a phase.

---

## 1. Goals and scope

### In scope (v1)

1. Connect multiple **Mastodon** and **Bluesky** accounts.
2. Compose posts with **text, images, and video**; choose which connected account(s) to send to.
3. **Schedule** posts to a specific date/time; a background **worker** publishes them even if the browser is closed.
4. **Unified dashboard** with three primary tabs: **Queue** (chronological list), **Calendar** (drag-and-drop), **Drafts** (list, same layout as Queue).
5. **Smart Preview**: live, per-platform rendering of the post while composing (the two can look similar for now).
6. **Drafts**: save without a date; promote to scheduled later.
7. Runs locally on Windows, exposed on `localhost`; Docker Compose for dependencies.

### Out of scope (v1)

Multi-user auth, teams, analytics, other networks, AI features, URL shorteners, mobile app. Design the code so they can be added later (adapter pattern, account-scoped data) but do not build them.

### Assumptions (state them in `PROGRESS.md` and proceed unless the user objects)

- Single local user; the app is bound to `localhost` only, so **no login screen** in v1.
- Times are stored in UTC and displayed in the browser's local time zone.
- Bluesky uses **app passwords** in v1 (simplest, reliable for a local tool). OAuth is a later enhancement.

---

## 2. Tech stack (decided)

| Concern          | Choice                                                       | Notes                                                                                       |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Package manager  | **pnpm** workspaces                                          | Enable via `corepack enable`.                                                               |
| Language         | **TypeScript** everywhere                                    | `strict: true`.                                                                             |
| Runtime          | **Node 22 LTS**                                              |                                                                                             |
| Frontend         | **Astro** + **React** islands                                | `@astrojs/react`, `@astrojs/node` (standalone SSR)                                          |
| Styling          | **Panda CSS**                                                | Uses the user's custom preset (provided after scaffold).                                    |
| Shared state     | **nanostores** + `@nanostores/react`                         | **No React Context for shared state.** Optionally `@nanostores/query` for fetching/caching. |
| Drag and drop    | **@dnd-kit/core**                                            | Custom calendar grid, styled with Panda.                                                    |
| Dates            | **date-fns** (+ `@date-fns/tz` if needed)                    |                                                                                             |
| API server       | **Hono** on `@hono/node-server`                              | Validation with **zod**.                                                                    |
| Database         | **PostgreSQL 16** (Docker)                                   |                                                                                             |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit`                              |                                                                                             |
| Job execution    | **DB-backed worker (polling with `FOR UPDATE SKIP LOCKED`)** | No Redis or extra queue dependency.                                                         |
| Mastodon client  | Plain `fetch` wrapper (or `masto`)                           | Own thin wrapper preferred for control.                                                     |
| Bluesky client   | **`@atproto/api`**                                           |                                                                                             |
| Image processing | **sharp**                                                    | Compress for Bluesky's blob limit.                                                          |
| Tests            | **Vitest** (+ **Playwright** for a few e2e smoke tests)      |                                                                                             |
| Lint/format      | ESLint + Prettier                                            |                                                                                             |

### Why a separate API/worker instead of Astro API routes?

The worker must keep running independent of any page request, and long-running video uploads/polling should not live inside the web server's request lifecycle. A dedicated `server` package with two entrypoints (`api`, `worker`) keeps that clean. Astro is purely the UI layer.

---

## 3. Repository layout

```
social-scheduler/
├─ apps/
│  ├─ web/                  # Astro + React + Panda + nanostores
│  └─ server/               # Hono API + worker + platform adapters
│     ├─ src/
│     │  ├─ api/            # routes (accounts, posts, media, settings)
│     │  ├─ worker/         # poll loop, publisher, retry logic
│     │  ├─ platforms/      # adapter interface + mastodon/ + bluesky/
│     │  ├─ db/             # drizzle schema, migrations, client
│     │  ├─ media/          # storage, validation, processing
│     │  ├─ crypto.ts       # token encryption
│     │  └─ env.ts          # zod-validated env
├─ packages/
│  └─ shared/               # zod schemas, DTO types, platform limits/constants
├─ storage/                 # uploaded media (git-ignored, Docker volume/bind mount)
├─ docker-compose.yml
├─ .env.example
├─ .gitattributes           # enforce LF line endings (Windows safety)
├─ PROGRESS.md
└─ README.md
```

### Windows-specific rules for the agent

- Do **not** write bash-only scripts. Use Node scripts or `pnpm` scripts that work in PowerShell and cmd. Use `cross-env` if env vars are needed in scripts.
- Add `.gitattributes` with `* text=auto eol=lf`.
- Use `path.join`/`path.resolve`; never hardcode `/` separators for filesystem paths.
- Assume Docker Desktop with the WSL2 backend. Use named volumes for Postgres data (bind mounts for Postgres perform poorly on Windows).

---

## 4. Architecture overview

```
Browser ──► Astro (web, :4321) ──fetch──► Hono API (:4000) ──► Postgres (:5432)
                                              │
                          Worker (poll loop) ─┤──► Mastodon instances (REST)
                                              └──► Bluesky (AT Protocol)
                          storage/ (media files, served by API)
```

- **API** and **worker** are two processes from the same `server` package (`pnpm --filter server start:api` / `start:worker`), sharing the DB layer and platform adapters.
- The web app calls the API directly. In dev, configure CORS for `http://localhost:4321`; the API base URL comes from `PUBLIC_API_URL`.
- All secrets (OAuth tokens, app passwords) are **encrypted at rest** with AES-256-GCM using `ENCRYPTION_KEY` from `.env`.

---

## 5. Data model (Drizzle / Postgres)

**`accounts`**

- `id` (uuid, pk), `platform` (`mastodon` | `bluesky`), `display_name`, `handle`, `avatar_url`
- `instance_url` (Mastodon only), `did` (Bluesky only)
- `credentials_encrypted` (text; JSON blob encrypted: tokens / app password / session)
- `limits_json` (cached platform limits: max chars, max media, size limits)
- `status` (`active` | `needs_reauth`), `created_at`, `updated_at`

**`mastodon_apps`** (one OAuth client registration per instance)

- `instance_url` (pk), `client_id`, `client_secret_encrypted`, `created_at`

**`posts`** (the user-facing composition)

- `id`, `status` (`draft` | `scheduled` | `publishing` | `published` | `partial` | `failed`)
- `body` (text; the base text), `scheduled_at` (timestamptz, null for drafts)
- `created_at`, `updated_at`

**`post_targets`** (one row per account the post goes to; the unit of work for the worker)

- `id`, `post_id` → posts, `account_id` → accounts
- `body_override` (nullable; per-platform text variant)
- `status` (`pending` | `publishing` | `published` | `failed` | `cancelled`)
- `attempts` (int), `next_attempt_at` (timestamptz), `locked_at` (nullable)
- `remote_id`, `remote_url`, `last_error`, `published_at`

**`media`**

- `id`, `kind` (`image` | `video`), `mime`, `size_bytes`, `width`, `height`, `duration_ms`
- `storage_path`, `original_filename`, `created_at`

**`post_media`** (ordered attachments)

- `post_id`, `media_id`, `position`, `alt_text`

**`settings`** (key/value): default timezone, late-publish grace window, default account selection.

Indexes: `post_targets(status, next_attempt_at)`, `posts(status, scheduled_at)`.

**Post status derivation:** a post is `published` when all targets published, `partial` when some published and some failed, `failed` when all failed, `publishing` when any target is in progress, `scheduled` otherwise. Keep this in one shared function and unit test it.

---

## 6. Platform adapter contract

Define in `apps/server/src/platforms/types.ts`:

```ts
interface PlatformAdapter {
  readonly platform: "mastodon" | "bluesky";
  verifyCredentials(account): Promise<AccountProfile>;
  getLimits(account): Promise<PlatformLimits>; // maxChars, maxImages, maxVideos, size limits, allowed mimes
  validate(content: PublishContent, limits): ValidationIssue[]; // used by API on save AND by UI for live feedback
  publish(
    account,
    content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }>;
}
```

`PublishContent` = text + ordered media (file handle, mime, alt text). Platform **limits and validation rules live in `packages/shared`** so the UI can reuse them for counters and warnings.

Errors must be classified as **retryable** (network, 5xx, 429 with `Retry-After`) or **permanent** (4xx validation, revoked auth). Auth failures set the account to `needs_reauth`.

### 6.1 Mastodon specifics (verify against docs.joinmastodon.org)

- **Connect flow:** user enters instance URL → server registers an OAuth app via `POST /api/v1/apps` (cache in `mastodon_apps`) → redirect user to `/oauth/authorize` with scopes `read write:statuses write:media` → callback on `http://localhost:4000/oauth/mastodon/callback` exchanges code at `/oauth/token` → `GET /api/v1/accounts/verify_credentials`.
- **Limits:** read `GET /api/v2/instance` → `configuration.statuses.max_characters`, `max_media_attachments`, and `configuration.media_attachments` (image/video size limits, supported mime types). Cache in `limits_json`, refresh on connect and daily.
- **Media:** `POST /api/v2/media` (multipart, include `description` for alt text). Video/large files return **202** and process asynchronously: **poll `GET /api/v1/media/:id`** until `url` is non-null (206 means still processing) with a timeout.
- **Post:** `POST /api/v1/statuses` with `status`, `media_ids[]`, and the **`Idempotency-Key`** header (use the post_target id) so retries never double-post.
- Mastodon counts URLs as a fixed length (23 chars) toward the limit; implement this in the shared character counter.

### 6.2 Bluesky specifics (verify against docs.bsky.app)

- **Auth (v1):** handle + **app password** via `com.atproto.server.createSession` using `@atproto/api` (`BskyAgent`). Store encrypted; re-login when the session expires. Allow a custom PDS host, default `https://bsky.social`.
- **Text:** 300 **graphemes** limit (use `RichText.graphemeLength`). Use `RichText.detectFacets(agent)` so links, mentions and hashtags become real facets.
- **Images:** up to 4 per post, each uploaded with `agent.uploadBlob`; **per-image size limit is about 1 MB**, so the worker must resize/compress with `sharp` before upload (keep originals untouched). Alt text goes in `app.bsky.embed.images`.
- **Video:** one video per post; **cannot be combined with images**. Flow: check `app.bsky.video.getUploadLimits` → get service auth token via `com.atproto.server.getServiceAuth` (audience `did:web:<pds host>`, lxm `com.atproto.repo.uploadBlob`) → upload to `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo` → **poll `app.bsky.video.getJobStatus`** until `JOB_STATE_COMPLETED` → embed with `app.bsky.embed.video` (include alt text, optional aspect ratio). Respect current max duration/size limits.
- **Idempotency:** Bluesky has no idempotency header. Before retrying a publish that may have partially succeeded, store the generated record `rkey` / `createdAt` deterministically per target (e.g., derive `rkey` from the target id) so a retry overwrites rather than duplicates.

---

## 7. Worker design (background execution)

- Worker is a Node process with a loop every **10-15 seconds**:
  1. In a transaction, select due targets: `status='pending' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT n FOR UPDATE SKIP LOCKED`; mark `publishing`, set `locked_at`.
  2. For each: load account + media, call adapter `publish`, then mark `published` (store `remote_id`, `remote_url`) or handle failure.
  3. Recompute the parent post's status.
- **Retries:** retryable errors → `attempts++`, exponential backoff with jitter (e.g., 30s, 2m, 10m, 1h), max 5 attempts, then `failed`. Honor `Retry-After`.
- **Stuck job recovery:** on startup and each loop, reset targets stuck in `publishing` with `locked_at` older than 10 minutes back to `pending` (idempotency keys make this safe for Mastodon; see Bluesky note above).
- **Missed schedules (PC asleep / app down):** on startup the worker simply picks up overdue targets. Add a setting `late_publish_grace_minutes` (default: unlimited = publish anyway). If set and exceeded, mark the target `failed` with a clear "missed schedule" error so the user can reschedule.
- **Concurrency:** limit to a few concurrent publishes (e.g., 3); serialize per account to be polite to rate limits.
- **Rescheduling / cancelling** is just an update to `scheduled_at` / `next_attempt_at` / `status` in the DB. There is no external queue to keep in sync, which is the main reason for this design.
- Graceful shutdown: finish in-flight jobs on SIGTERM.

---

## 8. API surface (Hono, all JSON, zod-validated, types from `packages/shared`)

```
GET    /api/health

GET    /api/accounts
POST   /api/accounts/mastodon/start        { instanceUrl } -> { authorizeUrl }
GET    /oauth/mastodon/callback            (redirects back to web app)
POST   /api/accounts/bluesky               { handle, appPassword, service? }
DELETE /api/accounts/:id
POST   /api/accounts/:id/refresh           (re-verify, refresh limits)

POST   /api/media                          multipart upload -> Media
GET    /media/:id                          serves the file (for previews/thumbnails)
DELETE /api/media/:id                      (only if unattached)

GET    /api/posts?status=&from=&to=        list (queue = scheduled; drafts = draft; calendar = range)
POST   /api/posts                          create (draft or scheduled)
GET    /api/posts/:id
PATCH  /api/posts/:id                      edit body, targets, media, scheduledAt
POST   /api/posts/:id/schedule             { scheduledAt }   (draft -> scheduled)
POST   /api/posts/:id/unschedule           (scheduled -> draft)
POST   /api/posts/:id/publish-now
POST   /api/posts/:id/retry                (retry failed targets)
DELETE /api/posts/:id

GET    /api/settings    PATCH /api/settings
```

Rules: scheduling requires at least one target and a future `scheduledAt`; drafts may be incomplete. Run each target through `adapter.validate` on schedule/publish and return per-target issues. Editing a scheduled post that is already `publishing` is rejected.

---

## 9. Frontend design

### 9.1 Pages (Astro) and navigation

- `/` redirects to `/queue`.
- `/queue`: chronological list of `scheduled` posts.
- `/calendar`: month/week calendar of scheduled posts (drag to reschedule).
- `/drafts`: list of drafts, **same layout/component as Queue**, different data and actions.
- `/accounts`: connect/manage accounts (also a connect prompt shown on first run).
- `/settings`: timezone, grace window.

Use one shared `AppLayout.astro` containing the header, **primary tab bar (Queue | Calendar | Drafts)**, a global **"New post"** button, and a toast region. Enable Astro's `<ClientRouter />` (view transitions) and mark the persistent shell islands (composer drawer, toasts) with `transition:persist` so state survives navigation. Pages render React islands with `client:only="react"` (this is an interactive app; SSR of data views is not needed).

### 9.2 State with nanostores (no React Context)

Create stores in `apps/web/src/stores/` and read them in React via `useStore` from `@nanostores/react`. Suggested stores:

| Store            | Type                      | Purpose                                                                                                                        |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `$accounts`      | atom/query                | Connected accounts + limits                                                                                                    |
| `$posts`         | map keyed by id, or query | Cached posts; derived `$queuePosts`, `$draftPosts` via `computed`                                                              |
| `$calendarRange` | atom                      | Visible date range and view mode (month/week)                                                                                  |
| `$calendarPosts` | computed                  | Posts for the visible range, grouped by day                                                                                    |
| `$composer`      | map                       | Current composer state: body, selected account ids, per-account overrides, media list, scheduledAt, editingPostId, open/closed |
| `$preview`       | computed                  | Per-platform rendered preview model derived from `$composer` + `$accounts`                                                     |
| `$toasts`        | atom                      | Notifications                                                                                                                  |

Put mutations in plain action functions next to the stores (e.g., `schedulePost()`, `movePost()`), using nanostores' `action()` helper. Components stay thin. Poll or refetch posts every ~30s and on window focus so status changes from the worker appear.

### 9.3 Composer (drawer or modal)

- **Account picker:** avatar chips for each connected account, toggle to include/exclude. Group by platform; show disabled state for `needs_reauth` accounts.
- **Editor:** textarea with a **per-platform character counter** (Mastodon limit from instance; Bluesky 300 graphemes). The counter shows the tightest limit among selected targets.
- **Per-platform override:** a small "Customize for Bluesky/Mastodon" toggle that reveals a separate text field for that target (stored in `body_override`).
- **Media:** drag-and-drop or file picker, upload immediately via `/api/media` with progress; thumbnails with reorder, remove, and **alt text** input per item. Show live validation (too many images, image + video mix on Bluesky, file too large, unsupported type) per selected platform.
- **Footer actions:** `Save draft`, `Schedule` (date + time picker, timezone label), `Post now`. Disable with explanations when validation fails.
- Opening from a calendar day cell pre-fills the date; opening from a card edits the existing post.

### 9.4 Smart Preview

- Right-hand panel (or tab) in the composer showing one preview card **per selected account/platform**, updating on every keystroke from `$preview`.
- Each platform has its own React component: `MastodonPreview`, `BlueskyPreview` (same visual treatment is acceptable in v1, but keep them separate components fed by a common `PreviewModel` so they can diverge).
- Preview must reflect: the effective text (override or base), link/hashtag/@mention highlighting, truncated-over-limit text highlighted in red, media grid layouts (1, 2, 3, 4 images; video with a play badge), alt-text badge, account avatar/handle/display name, and scheduled time.

### 9.5 Queue / Drafts lists

- Shared `PostList` + `PostCard` components. Card shows: text snippet, media thumbnails, target account avatars with per-target status icons, scheduled date/time (queue) or last-edited (drafts).
- Queue sorted ascending by `scheduledAt`, grouped by day headings (Today, Tomorrow, date). Show failed/partial posts at the top with a clear error + **Retry** action.
- Actions: Edit, Duplicate, Delete, Post now (queue), Schedule... / Move to drafts.
- Empty states with a call to action.

### 9.6 Calendar

- Custom grid (month and week views) built with Panda; **@dnd-kit** for drag and drop.
- Each scheduled post renders as a compact chip (time, platform icons, snippet). Drag a chip to another day (month view) or time slot (week view) to reschedule: **optimistic update**, then `PATCH`; roll back and toast on failure. Preserve the original time-of-day when dropping on a day cell.
- Clicking an empty day/slot opens the composer pre-filled with that date. Clicking a chip opens it for editing.
- Day cells show a count badge with overflow ("+3 more") popover. Highlight today; show posting density at a glance.
- Past times are not valid drop targets for scheduling (visually disabled).
- Keyboard accessible drag (dnd-kit keyboard sensor) and ARIA labels.

### 9.7 Panda CSS and the custom preset

- Phase 1 sets up Panda (`@pandacss/dev`, `panda init`, PostCSS integration for Astro, `styled-system` output git-ignored or committed per Panda guidance for monorepos).
- **Stop and ask the user for their preset** at the end of Phase 1. Then add it to `panda.config.ts` `presets: [...]` (alongside or instead of `@pandacss/preset-base` as the preset documentation dictates).
- After receiving it, **inspect its tokens, semantic tokens, recipes, patterns and conditions** and write a short `docs/design-system-notes.md` summarizing what is available.
- From then on: **use only preset tokens/recipes** for color, spacing, typography, radii, shadows; no hard-coded hex or px values except where no token exists (note each exception). Prefer `css()`, `cva()`/recipes, and patterns (`stack`, `hstack`, `grid`, `flex`) from `styled-system`.
- Before the preset arrives, build structure with unstyled/layout-only Panda utilities. Do not invent a theme.
- Support light/dark if the preset provides semantic tokens for it.

---

## 10. Docker Compose and local running

`docker-compose.yml` services:

- **`db`**: `postgres:16`, named volume `pgdata`, healthcheck (`pg_isready`), port `5432` published to localhost only (`127.0.0.1:5432:5432`).
- **`api`**: built from `apps/server`, runs migrations on start, port `4000`, mounts `./storage:/app/storage`, `depends_on: db (healthy)`, `restart: unless-stopped`.
- **`worker`**: same image, different command, same mounts/env, `restart: unless-stopped`.
- **`web`**: built from `apps/web` (Astro Node standalone), port `4321`.

Use a **single multi-stage Dockerfile for the server** (api and worker share it) and one for web. Use `node:22-slim` (sharp prebuilds work on Debian-based images). Bind published ports to `127.0.0.1` so the app is not exposed on the LAN.

**Two ways to run (document both in README):**

1. **Dev:** `docker compose up -d db`, then `pnpm dev` (runs web, api, and worker with hot reload via `concurrently`).
2. **"Always on":** `docker compose up -d --build` (everything in containers). Document enabling Docker Desktop's "Start when you sign in" so the worker survives reboots. Note that if the PC sleeps or is off, scheduled posts publish when it wakes (see worker grace setting).

`.env.example` must include: `DATABASE_URL`, `ENCRYPTION_KEY` (32-byte base64; provide `pnpm gen:key` script), `PUBLIC_API_URL`, `WEB_ORIGIN`, `API_PORT`, `STORAGE_DIR`, `MAX_UPLOAD_MB`.

---

## 11. Phased implementation plan

### Phase 1: Scaffold and tooling

**Tasks**

- Initialize pnpm workspace, TypeScript base config, ESLint/Prettier, `.gitattributes`, `.gitignore`, `.env.example`.
- Create `apps/web` (Astro + React + Node adapter + Panda CSS configured and working), `apps/server` (Hono hello-world + env validation), `packages/shared`.
- `docker-compose.yml` with `db`; root scripts: `dev`, `build`, `lint`, `test`, `db:generate`, `db:migrate`, `gen:key`.
- A trivial page rendering a React island that reads a nanostore and uses a Panda-styled element, proving the full pipeline.

**Acceptance:** `docker compose up -d db && pnpm dev` starts everything on Windows; page at `http://localhost:4321` renders the styled island; `GET http://localhost:4000/api/health` returns OK.

**⏸ STOP: ask the user for their custom Panda CSS preset before continuing.**

### Phase 2: Design system integration

- Add the user's preset, regenerate `styled-system`, write `docs/design-system-notes.md`.
- Build base primitives using the preset: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Tabs`, `Card`, `Badge`, `Avatar`, `Dialog/Drawer`, `Toast`, `EmptyState`, `Spinner`. Use an accessible headless lib (e.g., Ark UI, which pairs with Panda, or Radix) for dialogs/popovers/tabs if appropriate.
- Build `AppLayout.astro` with header, tab bar (Queue | Calendar | Drafts), "New post" button, and the persisted toast region.

**Acceptance:** all three tab routes exist with placeholder content, navigation works with view transitions, visuals use only preset tokens.

### Phase 3: Database, shared schemas, API skeleton

- Drizzle schema + migrations for all tables in section 5; migration runner on API start.
- `packages/shared`: zod schemas/DTOs, platform limit constants, post-status derivation (unit tested), character-count utilities (grapheme-aware; Mastodon URL=23).
- Token encryption module with tests (round-trip, tamper detection).
- CRUD for posts and settings (no platform calls yet), with validation and status transition rules.
- Media upload endpoint: store to `STORAGE_DIR`, extract metadata (sharp for images; ffprobe optional for video, otherwise trust mime/size), enforce `MAX_UPLOAD_MB`, serve files.

**Acceptance:** API tests (Vitest) cover post lifecycle and media upload; migrations apply cleanly on a fresh DB.

### Phase 4: Mastodon integration

- Adapter per section 6.1: connect flow, limits, media upload with async polling, publish with idempotency key.
- Accounts page UI: "Connect Mastodon" (instance URL input → redirect → callback → account appears).
- Unit tests with mocked `fetch` (success, 429, 5xx, 422, async media 202 then ready). Manual test against a real account or a test instance.

**Acceptance:** user can connect a Mastodon account and `publish-now` a text, image, and video post that appears on the instance.

### Phase 5: Bluesky integration

**⏸ Confirm auth approach with the user (default: app password).**

- Adapter per section 6.2: session handling, facets, image compression, video upload + job polling, embeds with alt text, validation (no image+video mix, max 4 images).
- Accounts page UI: "Connect Bluesky" (handle + app password, with a help link on creating an app password).
- Unit tests with mocks for the happy paths and error classification.

**Acceptance:** publish-now of text, image(s), and video works on a real Bluesky account; oversized images are automatically compressed under the limit.

### Phase 6: Worker and scheduling

- Implement the worker loop per section 7 (polling, locking, retries, stuck-job recovery, grace window, graceful shutdown).
- Wire `schedule`, `unschedule`, `publish-now`, `retry`, reschedule via PATCH.
- Integration tests against a real Postgres (testcontainers or the compose DB) using a **fake adapter**: due targets are published exactly once, two workers never double-process, failures back off and eventually fail, restart recovers stuck jobs.

**Acceptance:** scheduling a post 1 minute out with the browser closed results in it being published by the worker; killing and restarting the worker mid-flight does not lose or duplicate posts (for Mastodon).

### Phase 7: Composer and Smart Preview

- Implement stores (`$accounts`, `$composer`, `$preview`, etc.) and the composer UI per sections 9.2-9.4.
- Media uploads with progress, reorder, alt text; per-platform validation messages; per-platform override text.
- `MastodonPreview` and `BlueskyPreview` components fed by `PreviewModel`.
- Save draft / Schedule / Post now actions wired to the API.

**Acceptance:** typing updates the previews instantly; selecting only Bluesky shows only the Bluesky preview and counter; invalid combinations block Schedule with a clear reason; a full create-schedule-publish flow works from the UI.

### Phase 8: Queue, Drafts and Calendar views

- `PostList`/`PostCard` shared components; Queue and Drafts pages; actions and empty states.
- Calendar month + week views with dnd-kit reschedule, optimistic updates, click-to-create, overflow popovers.
- Auto-refresh (interval + focus) so worker-driven status changes appear without reload.

**Acceptance:** all three tabs match the spec; dragging a chip changes the post's scheduled time persistently and the worker honors the new time; drafts can be promoted to scheduled and scheduled posts moved back to drafts.

### Phase 9: Hardening, Docker, docs

- Error handling and user-facing messages for every failure mode (re-auth needed, rate limited, media rejected).
- Full Docker Compose stack build and run test; confirm containers restart and worker resumes.
- Playwright smoke tests: connect (mocked adapters via env flag), compose, schedule, drag on calendar.
- README: prerequisites (Windows, Docker Desktop/WSL2, Node 22, pnpm), setup, running modes, backup of `pgdata` and `storage/`, troubleshooting, how to add a new platform adapter.

**Acceptance:** fresh clone to running app follows the README with no undocumented steps; `pnpm lint`, `pnpm test`, and `pnpm build` pass.

---

## 12. Quality bar and conventions

- **Types end to end:** DTOs and zod schemas come from `packages/shared`; no `any` without a justifying comment.
- **Separation:** components render, stores hold state and actions, API client in `apps/web/src/lib/api.ts`. Business rules live on the server, with shared validators reused by the UI for instant feedback.
- **Security:** never log tokens or passwords; encrypt credentials; validate and sanitize uploads (mime sniffing, size limits, safe filenames); only fetch Mastodon instance URLs after normalizing to `https://host`; API bound to localhost.
- **Accessibility:** keyboard-operable composer, calendar and drag and drop; visible focus; labels and ARIA on icon buttons.
- **Observability:** structured logs (pino) in the API and worker, including target id and attempt number on every publish attempt.
- **Testing priorities:** worker correctness, adapter error handling, status derivation, validation rules, calendar reschedule logic. Don't chase UI snapshot coverage.
- **Commits:** one logical commit per task, conventional commit messages.

---

## 13. Future enhancements (do not build now; keep the design open to them)

- Bluesky OAuth; more networks (adapter interface already supports this).
- Thread/multi-part posts, recurring posts, best-time suggestions, post templates, tags/labels.
- Media library, analytics, auth for non-local hosting, import/export, browser notifications on failure.
