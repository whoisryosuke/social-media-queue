# PROGRESS

> State file for the Social Scheduler build. Owned by the `phase-builder` agent. The spec lives in `PLAN.md` (read-only).
> Keep this file accurate after every task so a fresh session can resume with no other context.

**Legend:** phase status = `not-started` | `in-progress` | `blocked` | `done` &nbsp;·&nbsp; tasks = `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked

---

## Current state

| Field                      | Value                         |
| -------------------------- | ----------------------------- |
| Active phase               | Phase 7: Composer and Smart Preview |
| Phase status               | in-progress                   |
| Last completed task        | Phase 6 done (3 live worker publishes) |
| Next action                | 7.1 Stores + actions |
| Blocker / pending question | none                          |
| Last updated               | 2026-10-07                |

---

## Phase overview

| #   | Phase                                  | Status      | Completed | Stop point after/before                            |
| --- | -------------------------------------- | ----------- | --------- | -------------------------------------------------- |
| 1   | Scaffold and tooling                   | done        | 2026-10-07 | **After:** ask user for Panda CSS preset           |
| 2   | Design system integration              | done        | 2026-10-07 |                                                    |
| 3   | Database, shared schemas, API skeleton | done        | 2026-10-07 |                                                    |
| 4   | Mastodon integration                   | done        | 2026-10-07 | Verify API docs before starting                    |
| 5   | Bluesky integration                    | done        | 2026-10-07 | **Before:** confirm auth approach; verify API docs |
| 6   | Worker and scheduling                  | done        | 2026-10-07 |                                                    |
| 7   | Composer and Smart Preview             | in-progress |           |                                                    |
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

**Status:** done (2026-10-07)

**Before starting:** verify current Mastodon API docs and log under "API verification notes".

**Tasks**

- [x] 4.1 Adapter interface in `apps/server/src/platforms/types.ts` (if not already present)
- [x] 4.2 OAuth connect flow (app registration cached per instance, authorize, callback, verify credentials)
- [x] 4.3 Limits fetch from `/api/v2/instance`, cached in `limits_json`
- [x] 4.4 Media upload with async processing polling
- [x] 4.5 Publish with `Idempotency-Key`
- [x] 4.6 Error classification (retryable vs permanent; auth failure sets `needs_reauth`)
- [x] 4.7 Accounts page UI: "Connect Mastodon"
  - Note: `AccountsApp` island (connect form, account list, refresh/remove) + `apps/web/src/lib/api.ts` client. Verified `/accounts` renders the island; `GET /api/accounts` → `[]`.
- [x] 4.8 Unit tests with mocked `fetch` (success, 429, 5xx, 422, async media 202 then ready)

**Acceptance criteria**

- [x] User can connect a Mastodon account
- [x] `publish-now` of a text post works on a real instance
- [x] `publish-now` of an image post works
- [x] `publish-now` of a video post works

**Evidence:**

- Account `@aries710@mastodon.social` connected via OAuth (active, limits fetched: 500 chars / 4 media / 16MB img / ~99MB video), 2026-10-07
- Live publishes through `MastodonAdapter.publish` (temp script, deleted after): text → https://mastodon.social/@aries710/117401717024185097, image (png + alt text) → https://mastodon.social/@aries710/117401717301996173, video (mp4, async 202 → poll → ready) → https://mastodon.social/@aries710/117401717859852227, 2026-10-07. (Direct adapter calls — worker pickup of `publish-now` targets arrives in Phase 6.)
- `pnpm --filter server test` → 39 pass; `pnpm lint` exit 0, 2026-10-07

**Handoff notes:**

- Mastodon flow is end-to-end live: OAuth connect (cached per-instance app, `state` carries originating host), limits cached in `limits_json`, media 202-polling, `Idempotency-Key` publish, error classification with `needs_reauth` on 401/403.
- Test account `@aries710@mastodon.social` stays connected for Phase 6 worker tests.

---

## Phase 5: Bluesky integration

**Status:** done (2026-10-07)

**Before starting:** confirm auth approach with the user (default: app password). Verify current AT Protocol / video API docs and log under "API verification notes".

**Tasks**

- [x] 5.1 Session handling with `@atproto/api` (app password, optional custom PDS host)
- [x] 5.2 Rich text facets (links, mentions, hashtags)
- [x] 5.3 Image upload with `sharp` compression to the blob size limit (originals untouched), alt text
- [x] 5.4 Video upload: upload limits, service auth, upload, job polling, embed with alt text
- [x] 5.5 Validation: max 4 images, no image + video mix, 300 grapheme limit
- [x] 5.6 Idempotent retry strategy (deterministic `rkey` per target)
- [x] 5.7 Accounts page UI: "Connect Bluesky" with app password help link
- [x] 5.8 Unit tests with mocks (happy paths, error classification)
- [ ] 5.2 Rich text facets (links, mentions, hashtags)
- [ ] 5.3 Image upload with `sharp` compression to the blob size limit (originals untouched), alt text
- [ ] 5.4 Video upload: upload limits, service auth, upload, job polling, embed with alt text
- [ ] 5.5 Validation: max 4 images, no image + video mix, 300 grapheme limit
- [ ] 5.6 Idempotent retry strategy (deterministic `rkey` per target)
- [ ] 5.7 Accounts page UI: "Connect Bluesky" with app password help link
- [ ] 5.8 Unit tests with mocks (happy paths, error classification)

**Acceptance criteria**

- [x] `publish-now` of text works on a real Bluesky account
- [x] `publish-now` of image(s) works; oversized images are compressed under the limit
- [x] `publish-now` of a video works

**Evidence:**

- Account `@whoisryosuke.bsky.social` connected via app password (active), 2026-10-07
- Live publishes through `BlueskyAdapter.publish` (temp scripts, deleted after): text with link+hashtag facets → https://bsky.app/profile/whoisryosuke.bsky.social/post/3mxcv7nkrrs2s, image + alt → https://bsky.app/profile/whoisryosuke.bsky.social/post/3mxcv7rukxk2i, 3.5MB png auto-compressed → https://bsky.app/profile/whoisryosuke.bsky.social/post/3mxcv7x3ax227, video → https://bsky.app/profile/whoisryosuke.bsky.social/post/3mxcvgbkvlc2z, 2026-10-07. (Direct adapter calls — worker pickup arrives in Phase 6.)
- `pnpm --filter server test` → 55 pass (incl. `already_exists` reuse); `pnpm lint` exit 0, 2026-10-07

**Handoff notes:**

- Test account `@whoisryosuke.bsky.social` stays connected for Phase 6 worker tests.

---

## Phase 6: Worker and scheduling

**Status:** done (2026-10-07)

**Tasks**

- [x] 6.1 Worker poll loop with `FOR UPDATE SKIP LOCKED`
- [x] 6.2 Publisher: load account + media, call adapter, update target and parent post status
- [x] 6.3 Retry with exponential backoff + jitter, max attempts, `Retry-After` support
- [x] 6.4 Stuck-job recovery
- [x] 6.5 `late_publish_grace_minutes` setting
- [x] 6.6 Concurrency limits and per-account serialization
- [x] 6.7 Graceful shutdown on SIGTERM
- [x] 6.8 Endpoints wired: `schedule`, `unschedule`, `publish-now`, `retry`, reschedule via PATCH
  - Note: endpoints were built in Phase 3; verified present (`posts.ts`: schedule/unschedule/publish-now/retry/PATCH).
- [x] 6.9 Integration tests against real Postgres with a fake adapter
  - Note: 12 worker tests (exactly-once, no double-processing, backoff-then-fail, Retry-After, stuck recovery, grace window, per-account serialization, rkey reuse, needs_reauth, orphan drop). Test accounts use properly encrypted credential envelopes.
- [ ] 6.2 Publisher: load account + media, call adapter, update target and parent post status
- [ ] 6.3 Retry with exponential backoff + jitter, max attempts, `Retry-After` support
- [ ] 6.4 Stuck-job recovery
- [ ] 6.5 `late_publish_grace_minutes` setting
- [ ] 6.6 Concurrency limits and per-account serialization
- [ ] 6.7 Graceful shutdown on SIGTERM
- [ ] 6.8 Endpoints wired: `schedule`, `unschedule`, `publish-now`, `retry`, reschedule via PATCH
- [ ] 6.9 Integration tests against real Postgres with a fake adapter

**Acceptance criteria**

- [x] Post scheduled ~1 minute out with the browser closed is published by the worker
- [x] Killing/restarting the worker mid-flight does not lose or duplicate posts (Mastodon)
- [x] Tests: published exactly once, no double-processing by two workers, backoff then fail, stuck recovery

**Evidence:**

- Live test 1 (scheduled 75s out, worker running): claimed 1 → published 1 → https://mastodon.social/@aries710/117401987536726260, 2026-10-07
- Live test 2 (loop-tick check after unref fix): https://mastodon.social/@aries710/117401998904924638, 2026-10-07
- Live test 3 (worker stopped past due, row set `publishing` + 30-min-old lock to simulate mid-flight kill, worker restarted): `recovered:1, claimed:1, published:1`, attempts stayed 1, single remoteId https://mastodon.social/@aries710/117402008230255652, 2026-10-07
- `pnpm --filter server test` → 67 pass (12 worker tests); `pnpm lint` exit 0, 2026-10-07

**Handoff notes:**

- Worker entrypoints: `start:worker` (tsx watch) / `start:worker:prod` (dist). Poll 12s, batch 10, concurrency 3, stuck timeout 10min, max 5 attempts, backoffs 30s/2m/10m/1h + jitter.
- Real bug found live: `timer.unref?.()` in the loop let the process exit (non-watch) / never tick — removed, never unref the loop timer.
- Claim rows come back `snake_case` from raw SQL — `toTargetRow` maps to camelCase; keep this mapping if the claim query changes.
- Test accounts use real encrypted credential envelopes (`encrypt()` in test setup); plaintext `{}` fails closed as unreadable.
- API logging with pino deferred to Phase 9 (worker logs structured already).

---

## Phase 7: Composer and Smart Preview

**Status:** not-started

**Tasks**

- [x] 7.1 Stores: `$accounts`, `$posts` (+ derived), `$composer`, `$preview`, `$toasts`, with action functions
  - Note: nanostores 0.11 removed `action()` — mutations are plain exported functions. `payload()` only sends non-empty overrides for platforms with the override toggle on, and skips still-uploading media.
- [x] 7.2 Account picker (chips, platform grouping, `needs_reauth` disabled state)
- [x] 7.3 Editor with per-platform character counters and per-platform override text
- [x] 7.4 Media: drag/drop upload with progress, reorder, remove, alt text, per-platform validation
- [x] 7.5 `PreviewModel` + `MastodonPreview` and `BlueskyPreview` components fed by `PreviewModel`
- [x] 7.6 Footer actions: Save draft, Schedule (date/time + timezone label), Post now
- [x] 7.7 Composer opens pre-filled (from calendar day) or in edit mode (from card)
  - Note: `openComposer()` options API (`editingPostId/Status`, prefill body/accounts/media/date) is ready; calendar/card callers land in Phase 8.
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
| 2   | Bluesky auth approach confirmed (before Phase 5) | 2026-10-07 | 2026-10-07 | App password (PLAN default) |

---

## Decisions

Append only. Include user answers and any technical choices not dictated by `PLAN.md`.

| Date       | Decision                                  | Reason / source                    |
| ---------- | ----------------------------------------- | ---------------------------------- |
| YYYY-MM-DD | _(example)_ Bluesky v1 uses app passwords | PLAN assumption; confirmed by user |
| 2026-10-07 | Panda preset = user's "daw-preset" at `apps/web/src/theme`, sole entry in `panda.config.ts presets` | Stop point 1 answer; provided by user |
| 2026-10-07 | Headless UI = Ark UI (`@ark-ui/react`) for Dialog/Tabs/Avatar | PLAN's first suggestion; pairs with Panda, supports React 18 |
| 2026-10-07 | Bluesky v1 uses app passwords | Stop point 2 answer; confirmed by user |

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
| 2026-10-07 | 4 | `env.ts` loads repo-root `.env` explicitly (`../../.env`, `../.env`, `.env`) | `pnpm --filter server` runs with cwd=apps/server so `dotenv/config` never saw the root `.env`; dev encryption key was unreadable |
| 2026-10-07 | 4 | Root `.env` created from `.env.example` with a fresh `gen:key` (git-ignored) | Dev API needs a 32-byte key; first generated key was rotated after accidental display in tool output |
| 2026-10-07 | 4 | `WEB_ORIGIN` supports comma-separated origins; local `.env` allows `:4321,:4322` | API's CORS rejected the web app when Astro shifted to :4322 (blog occupies :4321): preflight 204 without ACAO header |
| 2026-10-07 | 4 | OAuth `state` carries the originating web host (`<instance>\|<origin>`); callbacks redirect to it (validated, else first origin) | `WEB_ORIGIN` list leaked into the redirect Location (`http://localhost:4321,http://localhost:4322/accounts?...`), which Firefox rejects as Corrupted Content |

---

## API verification notes

Append only. Record what was checked against current official docs and any differences from `PLAN.md`.

| Date | Platform | Docs checked | Finding |
| ---- | -------- | ------------ | ------- |
| 2026-10-07 | Mastodon | methods/apps, methods/media, methods/statuses (docs last updated 2026-05-01) | All match PLAN: `POST /api/v1/apps` (client_name, redirect_uris array, scopes; returns client_id/secret; 4.4 adds client_secret_expires_at); `POST /api/v2/media` multipart (200 sync / 202 async, poll `GET /api/v1/media/:id`, 206 = processing); `POST /api/v1/statuses` (status + media_ids[], `Idempotency-Key` header stored up to 1 hour). No design change needed. |
| 2026-10-07 | Bluesky | docs.bsky.app video tutorial + video lexicons + rate limits (checked 2026-10-07) | Flow matches PLAN with refinements: `getServiceAuth` aud `did:web:<pds host>`, lxm `com.atproto.repo.uploadBlob`, exp +30min; upload to `video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=&name=`; poll `getJobStatus` until blob present (also handle `already_exists` → reuse blob); gate on `getUploadLimits.canUpload`; email verification required for video on bsky-hosted accounts; PDS blob cap 50MB. Publish via `putRecord` with deterministic rkey (target id) for idempotent retries. REFINED 2026-10-07: `app.bsky.feed.post` only accepts TIDs as rkeys, so idempotency = one TID per target generated once and stored in new `post_targets.rkey` column (migration 0001), reused across retries. Video service is called directly (PDS 501s): `getUploadLimits`/`getJobStatus` with aud `did:web:video.bsky.app` + per-method lxm; `uploadVideo` with aud `did:web:<real PDS host>` (resolved via plc.directory DID doc) + lxm `com.atproto.repo.uploadBlob`; 409 `already_exists` → poll the returned jobId for its blob. |

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

### 2026-10-07, Session 2 (Phases 2–4)

- **Done:** Phase 2 (preset integration + compat fixes, design notes, 13 primitives, AppLayout, 5 routes; Astro 4→5 upgrade); Phase 3 (Drizzle schema + 7-table migration, posts/settings/media CRUD, encryption, shared schemas; 19 API tests); Phase 4 server + UI (adapter, OAuth connect flow, accounts routes + UI, 13 adapter tests + 5 connect tests).
- **Verified:** `POST /api/accounts/mastodon/start` against live mastodon.social returned a real `authorizeUrl`; `/accounts` renders; `pnpm test` all green (52 tests).
- **Next:** User authorizes a real Mastodon account via `/accounts`, then approve publish-now text/image/video tests to close Phase 4.
