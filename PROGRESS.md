# PROGRESS

> State file for the Social Scheduler build. Owned by the `phase-builder` agent. The spec lives in `PLAN.md` (read-only).
> Keep this file accurate after every task so a fresh session can resume with no other context.

**Legend:** phase status = `not-started` | `in-progress` | `blocked` | `done` &nbsp;·&nbsp; tasks = `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked

---

## Current state

| Field                      | Value                         |
| -------------------------- | ----------------------------- |
| Active phase               | Phase 1: Scaffold and tooling |
| Phase status               | in-progress                   |
| Last completed task        | none                          |
| Next action                | Phase 1, task 1.3: packages/shared |
| Blocker / pending question | none                          |
| Last updated               | 2026-10-07                    |

---

## Phase overview

| #   | Phase                                  | Status      | Completed | Stop point after/before                            |
| --- | -------------------------------------- | ----------- | --------- | -------------------------------------------------- |
| 1   | Scaffold and tooling                   | in-progress |           | **After:** ask user for Panda CSS preset           |
| 2   | Design system integration              | not-started |           |                                                    |
| 3   | Database, shared schemas, API skeleton | not-started |           |                                                    |
| 4   | Mastodon integration                   | not-started |           | Verify API docs before starting                    |
| 5   | Bluesky integration                    | not-started |           | **Before:** confirm auth approach; verify API docs |
| 6   | Worker and scheduling                  | not-started |           |                                                    |
| 7   | Composer and Smart Preview             | not-started |           |                                                    |
| 8   | Queue, Drafts and Calendar views       | not-started |           |                                                    |
| 9   | Hardening, Docker, docs                | not-started |           |                                                    |

---

## Phase 1: Scaffold and tooling

**Status:** in-progress

**Tasks**

- [x] 1.1 Initialize pnpm workspace, TypeScript base config, ESLint/Prettier
  - Note: dropped `.npmrc` (`use-node-version=22` rejected by pnpm 8; env runs Node 24).
- [x] 1.2 Add `.gitattributes` (`* text=auto eol=lf`), `.gitignore`, `.env.example`
- [ ] 1.3 Create `packages/shared`
- [ ] 1.4 Create `apps/server` (Hono hello-world + zod-validated env)
- [ ] 1.5 Create `apps/web` (Astro + React + Node adapter + Panda CSS configured)
- [ ] 1.6 `docker-compose.yml` with `db` service (Postgres 16, named volume, healthcheck, localhost-bound port)
- [ ] 1.7 Root scripts: `dev`, `build`, `lint`, `test`, `db:generate`, `db:migrate`, `gen:key`
- [ ] 1.8 Proof-of-pipeline page: React island reading a nanostore and rendering a Panda-styled element

**Acceptance criteria** (record evidence for each)

- [ ] `docker compose up -d db && pnpm dev` starts everything on Windows
- [ ] `http://localhost:4321` renders the styled island
- [ ] `GET http://localhost:4000/api/health` returns OK

**Evidence:**

- _(none yet)_

**Handoff notes:**

- _(none yet)_

**Stop point:** ask the user for their custom Panda CSS preset. Do not start Phase 2 until it is provided.

---

## Phase 2: Design system integration

**Status:** not-started

**Tasks**

- [ ] 2.1 Add user's Panda preset to `panda.config.ts`, regenerate `styled-system`
- [ ] 2.2 Write `docs/design-system-notes.md` (tokens, semantic tokens, recipes, patterns, conditions)
- [ ] 2.3 Base primitives: Button, IconButton, Input, Textarea, Select, Tabs, Card, Badge, Avatar, Dialog/Drawer, Toast, EmptyState, Spinner
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

- [ ] 3.1 Drizzle schema + migrations for all tables in PLAN section 5
- [ ] 3.2 Migration runner on API start
- [ ] 3.3 `packages/shared`: zod schemas/DTOs, platform limit constants
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

**Status:** not-started

**Before starting:** verify current Mastodon API docs and log under "API verification notes".

**Tasks**

- [ ] 4.1 Adapter interface in `apps/server/src/platforms/types.ts` (if not already present)
- [ ] 4.2 OAuth connect flow (app registration cached per instance, authorize, callback, verify credentials)
- [ ] 4.3 Limits fetch from `/api/v2/instance`, cached in `limits_json`
- [ ] 4.4 Media upload with async processing polling
- [ ] 4.5 Publish with `Idempotency-Key`
- [ ] 4.6 Error classification (retryable vs permanent; auth failure sets `needs_reauth`)
- [ ] 4.7 Accounts page UI: "Connect Mastodon"
- [ ] 4.8 Unit tests with mocked `fetch` (success, 429, 5xx, 422, async media 202 then ready)

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
| 1   | Panda CSS preset requested (end of Phase 1)      |         |          |               |
| 2   | Bluesky auth approach confirmed (before Phase 5) |         |          |               |

---

## Decisions

Append only. Include user answers and any technical choices not dictated by `PLAN.md`.

| Date       | Decision                                  | Reason / source                    |
| ---------- | ----------------------------------------- | ---------------------------------- |
| YYYY-MM-DD | _(example)_ Bluesky v1 uses app passwords | PLAN assumption; confirmed by user |

---

## Deviations and corrections

Append only. Anything that differs from `PLAN.md`, or where this file was corrected to match the repository.

| Date | Phase | What differed | Why / resolution |
| ---- | ----- | ------------- | ---------------- |
|      |       |               |                  |

---

## API verification notes

Append only. Record what was checked against current official docs and any differences from `PLAN.md`.

| Date | Platform | Docs checked | Finding |
| ---- | -------- | ------------ | ------- |
|      | Mastodon |              |         |
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
|      |      |       |        |

---

## Session log

Newest entry last.

### YYYY-MM-DD, Session 0 (template)

- **Done:** _(what was completed)_
- **Verified:** _(what was run/checked)_
- **Next:** _(what the next session should start with)_
