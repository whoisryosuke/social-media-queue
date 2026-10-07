# PROGRESS

> State file for the Social Scheduler build. Owned by the `phase-builder` agent. The spec lives in `PLAN.md` (read-only).
> Keep this file accurate after every task so a fresh session can resume with no other context.

**Legend:** phase status = `not-started` | `in-progress` | `blocked` | `done` &nbsp;·&nbsp; tasks = `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked

---

## Current state

| Field                      | Value                         |
| -------------------------- | ----------------------------- |
| Active phase               | Phase 4: Mastodon integration |
| Phase status               | in-progress                   |
| Last completed task        | 3.8 Media upload endpoint |
| Next action                | Verify Mastodon API docs, then 4.1 adapter interface |
| Blocker / pending question | none                          |
| Last updated               | 2026-10-07                |

---

## Phase overview

| #   | Phase                                  | Status      | Completed | Stop point after/before                            |
| --- | -------------------------------------- | ----------- | --------- | -------------------------------------------------- |
| 1   | Scaffold and tooling                   | done        | 2026-10-07 | **After:** ask user for Panda CSS preset           |
| 2   | Design system integration              | done        | 2026-10-07 |                                                    |
| 3   | Database, shared schemas, API skeleton | done        | 2026-10-07 |                                                    |
| 4   | Mastodon integration                   | in-progress |           | Verify API docs before starting                    |
| 5   | Bluesky integration                    | not-started |           | **Before:** confirm auth approach; verify API docs |
| 6   | Worker and scheduling                  | not-started |           |                                                    |
| 7   | Composer and Smart Preview             | not-started |           |                                                    |
| 8   | Queue, Drafts and Calendar views       | not-started |           |                                                    |
| 9   | Hardening, Docker, docs                | not-started |           |                                                    |

---

## Phase 1: Scaffold and tooling

**Status:** done (2026-10-07)

**Tasks**

- [x] 1.1 Initialize pnpm workspace, TypeScript base config, ESLint/Prettier
  - Note: dropped `.npmrc` (`use-node-version=22` rejected by pnpm 8; env runs Node 24).
- [x] 1.2 Add `.gitattributes` (`* text=auto eol=lf`), `.gitignore`, `.env.example`
- [x] 1.3 Create `packages/shared`
- [x] 1.4 Create `apps/server` (Hono hello-world + zod-validated env)
- [x] 1.5 Create `apps/web` (Astro + React + Node adapter + Panda CSS configured)
- [x] 1.6 `docker-compose.yml` with `db` service (Postgres 16, named volume, healthcheck, localhost-bound port)
- [x] 1.7 Root scripts: `dev`, `build`, `lint`, `test`, `db:generate`, `db:migrate`, `gen:key`
- [~] 1.8 Proof-of-pipeline page: React island reading a nanostore and rendering a Panda-styled element
- [x] 1.8 Proof-of-pipeline page: React island reading a nanostore and rendering a Panda-styled element

**Acceptance criteria** (record evidence for each)

- [x] `docker compose up -d db && pnpm dev` starts everything on Windows
- [x] `http://localhost:4321` renders the styled island
- [x] `GET http://localhost:4000/api/health` returns OK

**Evidence:**

- `docker compose up -d db` → `social-media-queue-db-1` Running (postgres:16, healthcheck `pg_isready`), 2026-10-07
- `pnpm dev` (concurrently) started web + api + worker in one command: worker logged `worker started (placeholder loop)`, api logged `api listening on http://localhost:4000`, web `astro ready` — 2026-10-07
- `GET /api/health` → `{"ok":true}` via `Invoke-RestMethod`, 2026-10-07
- `GET /queue` → 200, HTML contains `<astro-island ... DemoIsland ... client="only">` and Panda `@layer reset, base, tokens, recipes, utilities` style block (verified via `curl.exe`), 2026-10-07
- `pnpm lint` exit 0, `pnpm test` exit 0 (passWithNoTests), `pnpm build` exit 0 (astro SSR + client built), 2026-10-07
- Note: during verification port 4321 was occupied by the user's other project (ryosuke-astro-blog `astro dev`), so Astro served on 4322. On a clean machine the app takes 4321 as configured.

**Handoff notes:**

- Panda uses the default preset only; no custom tokens. `styled-system/` is generated (`pnpm --filter web prepare`) and git-ignored.
- `apps/web/src/env.d.ts` is Astro-generated and committed (standard).
- Web `astro.config.mjs`: `output: 'server'` + `@astrojs/node` standalone, port 4321. Server `start:api`/`start:worker` use `tsx watch`; `:prod` variants run compiled `dist/`.
- `storage/` is git-ignored runtime data (no `.gitkeep` — the exception pattern did not un-ignore it, so it was removed).

**Stop point:** ask the user for their custom Panda CSS preset. Do not start Phase 2 until it is provided.

---

## Phase 2: Design system integration

**Status:** done (2026-10-07)

**Tasks**

- [x] 2.1 Add user's Panda preset to `panda.config.ts`, regenerate `styled-system`
  - Note: preset provided by user at `apps/web/src/theme` ("daw-preset"), wired as `presets: [preset]` (replaces base preset). Compat fixes by agent: `bgLinear` → `bgGradient` (renamed in Panda 0.53) in `button.recipe.ts` + `panel.style.ts`; added explicit `: Preset`/`: Tokens` annotations (TS2742 under pnpm isolation); added `@pandacss/types@0.53.7` dev dep. Verified: `panda codegen` + `tsc` + `eslint` + `astro build` all pass.
- [x] 2.2 Write `docs/design-system-notes.md` (tokens, semantic tokens, recipes, patterns, conditions)
- [x] 2.3 Base primitives: Button, IconButton, Input, Textarea, Select, Tabs, Card, Badge, Avatar, Dialog/Drawer, Toast, EmptyState, Spinner
  - Note: headless = Ark UI (`@ark-ui/react`, React 18 compatible). Select is a styled native (accessible by default). Toast = nanostore `$toasts` + `ToastRegion` island (auto-dismiss 5s). `IconButton` requires `label`.
- [x] 2.4 `AppLayout.astro`: header, tab bar (Queue | Calendar | Drafts), "New post" button, persisted toast region, `<ClientRouter />`
- [x] 2.5 Placeholder routes: `/queue`, `/calendar`, `/drafts`, `/accounts`, `/settings`

**Acceptance criteria**

- [x] All three tab routes exist with placeholder content
- [x] Navigation works with view transitions
- [x] Visuals use only preset tokens (exceptions logged below)

**Evidence:**

- `GET /queue /calendar /drafts /accounts /settings` → all 200 on Astro dev (2026-10-07; served on :4322 because :4321 held by user's blog project)
- Served HTML contains `ClientRouter` script + `astro-view-transitions-enabled` meta, tab links with `aria-current="page"` on the active tab, and `transition:persist` islands (`new-post`, `toasts`) — verified via `curl.exe`, 2026-10-07. Full client-side transition animation needs a real browser (not available to agent).
- `pnpm lint` exit 0, `pnpm --filter web build` exit 0 (Astro 5.18.2 SSR), 2026-10-07
- Token grep over `src/components|layouts|pages`: only raw values are `borderWidth 1px/2px` (preset has no border-width scale; logged as exceptions). No hex colors, no px spacing/typography.

**Handoff notes:**

- Primitives live in `apps/web/src/components/ui/` (+ barrel `index.ts`); Ark UI used for Tabs/Avatar/Dialog parts; Select is a styled native; Toast = `$toasts` nanostore + `ToastRegion` island (auto-dismiss 5s).
- `Badge`/`Button` take a runtime `colorPalette` prop (works via `staticCss.colorPalette` classes + `colorPalette.N` token refs — do NOT use dynamic template colors, Panda can't extract those).
- `AppLayout` tab bar is server-rendered Astro (no JS); "New post" button is an island pushing an info toast until the Phase 7 composer exists.
- Phase-1 `DemoIsland` + `demo.ts` store removed (superseded by AppLayout; pipeline proof recorded in Phase 1 evidence).
- [ ] 2.4 `AppLayout.astro`: header, tab bar (Queue | Calendar | Drafts), "New post" button, persisted toast region, `<ClientRouter />`
- [ ] 2.5 Placeholder routes: `/queue`, `/calendar`, `/drafts`, `/accounts`, `/settings`

**Acceptance criteria**

- [ ] All three tab routes exist with placeholder content
- [ ] Navigation works with view transitions
- [ ] Visuals use only preset tokens (exceptions logged below)

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 3: Database, shared schemas, API skeleton

**Status:** not-started

**Tasks**

- [x] 3.1 Drizzle schema + migrations for all tables in PLAN section 5
  - Note: verified `db:generate` + `db:migrate` against fresh `scheduler_test` DB — all 7 tables created.
- [x] 3.2 Migration runner on API start
  - Note: verified API boots (migrations no-op on migrated DB) + `/api/health` OK.
- [ ] 3.2 Migration runner on API start
- [x] 3.3 `packages/shared`: zod schemas/DTOs, platform limit constants
- [x] 3.4 Post-status derivation function + unit tests
- [x] 3.5 Grapheme-aware character counting utilities (Mastodon URL = 23)
- [x] 3.6 Token encryption module (AES-256-GCM) + tests (round-trip, tamper detection)
- [x] 3.7 CRUD for posts and settings with validation and status transition rules
  - Note: per-target platform validation (`adapter.validate`) hooks in with Phase 4/5 adapters; structural + transition rules enforced now. API tests run against real Postgres (`scheduler_test`).
- [x] 3.8 Media upload endpoint: store, extract metadata, enforce size limit, serve files
  - Note: images validated + measured with `sharp`; videos checked by magic bytes (mp4 `ftyp`, webm EBML); `durationMs` stays null until ffprobe/adapter probing (Phase 4/5). Server test files run with `--fileParallelism=false` (shared test DB).

**Acceptance criteria**

- [x] Vitest API tests cover post lifecycle and media upload
- [x] Migrations apply cleanly on a fresh DB

**Evidence:**

- `pnpm --filter server test` → 3 files, 19 tests pass (10 post lifecycle incl. schedule/unschedule/retry/publish-now/publishing-guard/delete/list-filters/settings; 5 crypto; 4 media incl. serve-back byte equality) against real Postgres `scheduler_test`, 2026-10-07
- `db:migrate` on fresh `scheduler_test` created all 7 tables, 2026-10-07
- `pnpm lint` exit 0; `tsc --noEmit` clean for shared + server, 2026-10-07

**Handoff notes:**

- API routes are `db`-injected factories (`postsRoutes`, `settingsRoutes`, `mediaRoutes`, `mediaFileRoutes`); `createApp(webOrigin, db, { storageDir, maxUploadMB })`; files served at `GET /media/:id` (non-API path).
- `POST /api/posts` with `scheduledAt` but no `accountIds` → 400; `PATCH` on publishing → 409; removing a published target → 409; `scheduledAt: null` on non-draft via PATCH → 400 (use `unschedule`).
- Per-target platform validation (`adapter.validate`) is NOT wired yet — hooks in with Phase 4/5 adapters.
- [ ] 3.4 Post-status derivation function + unit tests
- [ ] 3.5 Grapheme-aware character counting utilities (Mastodon URL = 23)
- [ ] 3.6 Token encryption module (AES-256-GCM) + tests (round-trip, tamper detection)
- [ ] 3.7 CRUD for posts and settings with validation and status transition rules
- [ ] 3.8 Media upload endpoint: store, extract metadata, enforce size limit, serve files

**Acceptance criteria**

- [ ] Vitest API tests cover post lifecycle and media upload
- [ ] Migrations apply cleanly on a fresh DB

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 4: Mastodon integration

**Status:** in-progress

**Before starting:** verify current Mastodon API docs and log under "API verification notes".

**Tasks**

- [x] 4.1 Adapter interface in `apps/server/src/platforms/types.ts` (if not already present)
- [~] 4.2 OAuth connect flow (app registration cached per instance, authorize, callback, verify credentials)
- [x] 4.3 Limits fetch from `/api/v2/instance`, cached in `limits_json`
- [x] 4.4 Media upload with async processing polling
- [x] 4.5 Publish with `Idempotency-Key`
- [x] 4.6 Error classification (retryable vs permanent; auth failure sets `needs_reauth`)
- [ ] 4.7 Accounts page UI: "Connect Mastodon"
- [x] 4.8 Unit tests with mocked `fetch` (success, 429, 5xx, 422, async media 202 then ready)

**Acceptance criteria**

- [ ] User can connect a Mastodon account
- [ ] `publish-now` of a text post works on a real instance
- [ ] `publish-now` of an image post works
- [ ] `publish-now` of a video post works

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 5: Bluesky integration

**Status:** not-started

**Before starting:** confirm auth approach with the user (default: app password). Verify current AT Protocol / video API docs and log under "API verification notes".

**Tasks**

- [ ] 5.1 Session handling with `@atproto/api` (app password, optional custom PDS host)
- [ ] 5.2 Rich text facets (links, mentions, hashtags)
- [ ] 5.3 Image upload with `sharp` compression to the blob size limit (originals untouched), alt text
- [ ] 5.4 Video upload: upload limits, service auth, upload, job polling, embed with alt text
- [ ] 5.5 Validation: max 4 images, no image + video mix, 300 grapheme limit
- [ ] 5.6 Idempotent retry strategy (deterministic `rkey` per target)
- [ ] 5.7 Accounts page UI: "Connect Bluesky" with app password help link
- [ ] 5.8 Unit tests with mocks (happy paths, error classification)

**Acceptance criteria**

- [ ] `publish-now` of text works on a real Bluesky account
- [ ] `publish-now` of image(s) works; oversized images are compressed under the limit
- [ ] `publish-now` of a video works

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 6: Worker and scheduling

**Status:** not-started

**Tasks**

- [ ] 6.1 Worker poll loop with `FOR UPDATE SKIP LOCKED`
- [ ] 6.2 Publisher: load account + media, call adapter, update target and parent post status
- [ ] 6.3 Retry with exponential backoff + jitter, max attempts, `Retry-After` support
- [ ] 6.4 Stuck-job recovery
- [ ] 6.5 `late_publish_grace_minutes` setting
- [ ] 6.6 Concurrency limits and per-account serialization
- [ ] 6.7 Graceful shutdown on SIGTERM
- [ ] 6.8 Endpoints wired: `schedule`, `unschedule`, `publish-now`, `retry`, reschedule via PATCH
- [ ] 6.9 Integration tests against real Postgres with a fake adapter

**Acceptance criteria**

- [ ] Post scheduled ~1 minute out with the browser closed is published by the worker
- [ ] Killing/restarting the worker mid-flight does not lose or duplicate posts (Mastodon)
- [ ] Tests: published exactly once, no double-processing by two workers, backoff then fail, stuck recovery

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 7: Composer and Smart Preview

**Status:** not-started

**Tasks**

- [ ] 7.1 Stores: `$accounts`, `$posts` (+ derived), `$composer`, `$preview`, `$toasts`, with action functions
- [ ] 7.2 Account picker (chips, platform grouping, `needs_reauth` disabled state)
- [ ] 7.3 Editor with per-platform character counters and per-platform override text
- [ ] 7.4 Media: drag/drop upload with progress, reorder, remove, alt text, per-platform validation
- [ ] 7.5 `PreviewModel` + `MastodonPreview` and `BlueskyPreview` components
- [ ] 7.6 Footer actions: Save draft, Schedule (date/time + timezone label), Post now
- [ ] 7.7 Composer opens pre-filled (from calendar day) or in edit mode (from card)

**Acceptance criteria**

- [ ] Typing updates previews instantly
- [ ] Selecting only Bluesky shows only the Bluesky preview and counter
- [ ] Invalid combinations block Schedule with a clear reason
- [ ] Full create → schedule → publish flow works from the UI

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 8: Queue, Drafts and Calendar views

**Status:** not-started

**Tasks**

- [ ] 8.1 Shared `PostList` / `PostCard` components
- [ ] 8.2 Queue page (chronological, day groups, failed/partial on top with Retry)
- [ ] 8.3 Drafts page (same layout, draft-specific actions)
- [ ] 8.4 Calendar month view with dnd-kit reschedule (optimistic update + rollback)
- [ ] 8.5 Calendar week view
- [ ] 8.6 Click-to-create, overflow popovers, past-time drop targets disabled, keyboard-accessible drag
- [ ] 8.7 Auto-refresh (interval + window focus)

**Acceptance criteria**

- [ ] All three tabs match the spec
- [ ] Dragging a chip persistently changes scheduled time and the worker honors it
- [ ] Drafts can be promoted to scheduled; scheduled posts can be moved back to drafts

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Phase 9: Hardening, Docker, docs

**Status:** not-started

**Tasks**

- [ ] 9.1 User-facing messages for all failure modes (re-auth, rate limit, media rejected)
- [ ] 9.2 Dockerfiles (server multi-stage, web) and full `docker-compose.yml` (db, api, worker, web)
- [ ] 9.3 Verify containers restart and worker resumes
- [ ] 9.4 Playwright smoke tests (connect with mocked adapters, compose, schedule, calendar drag)
- [ ] 9.5 README: prerequisites, setup, run modes, backups, troubleshooting, adding an adapter

**Acceptance criteria**

- [ ] Fresh clone → running app by following README only
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

---

## Stop points

Log each stop point when reached and when resolved. Append only.

| #   | Stop point                                       | Reached | Resolved | User's answer |
| --- | ------------------------------------------------ | ------- | -------- | ------------- |
| 1   | Panda CSS preset requested (end of Phase 1)      | 2026-10-07 | 2026-10-07 | User added `apps/web/src/theme` ("daw-preset") and wired `panda.config.ts` |
| 2   | Bluesky auth approach confirmed (before Phase 5) |         |          |               |

---

## Decisions

Append only. Include user answers and any technical choices not dictated by `PLAN.md`.

| Date       | Decision                                  | Reason / source                    |
| ---------- | ----------------------------------------- | ---------------------------------- |
| YYYY-MM-DD | _(example)_ Bluesky v1 uses app passwords | PLAN assumption; confirmed by user |
| 2026-10-07 | Panda preset = user's "daw-preset" at `apps/web/src/theme`, sole entry in `panda.config.ts presets` | Stop point 1 answer; provided by user |
| 2026-10-07 | Headless UI = Ark UI (`@ark-ui/react`) for Dialog/Tabs/Avatar | PLAN's first suggestion; pairs with Panda, supports React 18 |

---

## Deviations and corrections

Append only. Anything that differs from `PLAN.md`, or where this file was corrected to match the repository.

| Date | Phase | What differed | Why / resolution |
| ---- | ----- | ------------- | ---------------- |
| 2026-10-07 | 1 | Dropped `.npmrc` (`use-node-version=22` rejected by installed pnpm 8.9.2); env runs Node v24.14.0, not PLAN's Node 22 LTS | Avoid blocking Windows dev; revisit Node pinning in Phase 9 Docker work |
| 2026-10-07 | 1 | `storage/.gitkeep` removed; `storage/` stays fully git-ignored | `!.gitkeep` did not un-ignore inside ignored dir; matches PLAN (storage is runtime data) |
| 2026-10-07 | 1 | Web dev server verified on :4322 instead of :4321 | Port 4321 was occupied by the user's other project (ryosuke-astro-blog); app is configured for 4321 and takes it on a clean machine |
| 2026-10-07 | 2 | Upgraded Astro 4.16 → 5.18 (with `@astrojs/node@9`, `@astrojs/react@4`) | PLAN requires `<ClientRouter />`, which does not exist in Astro 4 (there it is `<ViewTransitions />`) |
| 2026-10-07 | 2 | Added `typescript-eslint` to root devDeps; flat config now parses TS (rules still empty) | Scaffold `eslint` could not parse TS sources at all; real rules deferred to Phase 9 |
| 2026-10-07 | 2 | Removed Phase-1 `DemoIsland` + `demo.ts` store when `queue.astro` moved to `AppLayout` | Superseded placeholder; keeps tree free of dead code |

---

## API verification notes

Append only. Record what was checked against current official docs and any differences from `PLAN.md`.

| Date | Platform | Docs checked | Finding |
| ---- | -------- | ------------ | ------- |
| 2026-10-07 | Mastodon | methods/apps, methods/media, methods/statuses (docs last updated 2026-05-01) | All match PLAN: `POST /api/v1/apps` (client_name, redirect_uris array, scopes; returns client_id/secret; 4.4 adds client_secret_expires_at); `POST /api/v2/media` multipart (200 sync / 202 async, poll `GET /api/v1/media/:id`, 206 = processing); `POST /api/v1/statuses` (status + media_ids[], `Idempotency-Key` header stored up to 1 hour). No design change needed. |
|      | Bluesky  |              |         |

---

## Open questions

Append only. Mark resolved rather than deleting.

- [ ] _(none yet)_

---

## Design system exceptions

Hard-coded values used because the Panda preset has no matching token. Append only.

| Date | File | Value | Reason |
| ---- | ---- | ----- | ------ |
| 2026-10-07 | `apps/web/src/components/ui/*.tsx`, `AppLayout.astro` | `borderWidth: '1px'` / `'2px'` | Preset `borders` token only defines `none`; no border-width scale exists |

---

## Session log

Newest entry last.

### 2026-10-07, Session 1 (Phase 1 scaffold)

- **Done:** Full Phase 1 scaffold: pnpm workspace + TS strict + ESLint/Prettier; `.gitattributes`/`.gitignore`/`.env.example`; `packages/shared` placeholder; Hono API (`/api/health`) + zod env + worker placeholder; Astro+React+Panda web with nanostore `DemoIsland` on `/queue`; compose `db` (postgres:16); `gen:key` script. 8 commits.
- **Verified:** `docker compose up -d db` (Running); `pnpm dev` starts web+api+worker; `/api/health` → `{"ok":true}`; `/queue` → 200 with island + Panda layers; `pnpm lint/test/build` all exit 0.
- **Next:** STOP POINT 1 — user provides custom Panda CSS preset; then Phase 2 (preset install, `docs/design-system-notes.md`, primitives, `AppLayout`).
