import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { encrypt } from '../crypto.js'
import { createDb } from '../db/client.js'
import { accounts, posts, postTargets } from '../db/schema.js'
import { PlatformError, type PlatformAdapter, type PublishContent } from '../platforms/types.js'
import {
  backoffForAttempt,
  claimDueTargets,
  DEFAULT_WORKER_OPTIONS,
  publishTarget,
  recoverStuckTargets,
  runOnce,
} from './publisher.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test'

const pool = new Pool({ connectionString: TEST_DATABASE_URL })
const db = createDb(pool)

const TEST_KEY = randomBytes(32).toString('base64')
const TEST_CREDS = encrypt(JSON.stringify({ accessToken: 'test-token' }), TEST_KEY)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type Behavior = { kind: 'ok' } | { kind: 'fail'; error: PlatformError }

class FakeAdapter implements PlatformAdapter {
  readonly platform = 'mastodon' as const
  calls: { text: string; key: string }[] = []
  concurrent = 0
  maxConcurrent = 0
  perAccount = new Map<string, { current: number; max: number }>()
  script: Behavior[] = [{ kind: 'ok' }]
  latencyMs = 0

  private track(accountId: string, enter: boolean): void {
    this.concurrent += enter ? 1 : -1
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent)
    const entry = this.perAccount.get(accountId) ?? { current: 0, max: 0 }
    entry.current += enter ? 1 : -1
    entry.max = Math.max(entry.max, entry.current)
    this.perAccount.set(accountId, entry)
  }

  async verifyCredentials(): Promise<never> {
    throw new Error('not used')
  }

  async getLimits(): Promise<never> {
    throw new Error('not used')
  }

  validate(): [] {
    return []
  }

  async publish(
    account: { id: string },
    content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }> {
    this.track(account.id, true)
    try {
      this.calls.push({ text: content.text, key: ctx.idempotencyKey })
      if (this.latencyMs > 0) await sleep(this.latencyMs)
      const next = this.script.length > 1 ? this.script.shift() : this.script[0]
      if (next?.kind === 'fail') throw next.error
      return { remoteId: `remote-${this.calls.length}`, url: `https://x/${this.calls.length}` }
    } finally {
      this.track(account.id, false)
    }
  }
}

function adaptersFor(fake: FakeAdapter): { mastodon: PlatformAdapter; bluesky: PlatformAdapter } {
  return { mastodon: fake, bluesky: fake }
}

let accountId = ''

beforeEach(async () => {
  await db.execute(sql`TRUNCATE posts, media, settings, mastodon_apps CASCADE`)
  await db.delete(accounts)
  const [account] = await db
    .insert(accounts)
    .values({
      platform: 'mastodon',
      displayName: 'Worker',
      handle: '@worker@test',
      credentialsEncrypted: TEST_CREDS,
    })
    .returning()
  accountId = account.id
})

afterAll(async () => {
  await pool.end()
})

async function makePost(accountIds: string[] = [accountId]): Promise<string> {
  const [post] = await db
    .insert(posts)
    .values({ body: 'scheduled!', status: 'scheduled', scheduledAt: new Date(Date.now() + 60_000) })
    .returning()
  for (const id of accountIds) {
    await db.insert(postTargets).values({
      postId: post.id,
      accountId: id,
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000),
    })
  }
  return post.id
}

describe('worker', () => {
  it('publishes a due target exactly once and marks the post published', async () => {
    const fake = new FakeAdapter()
    const postId = await makePost()
    const result = await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      backoffsMs: [10, 10, 10, 10],
    })
    expect(result).toMatchObject({ claimed: 1, published: 1, failed: 0 })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].key).toBeTruthy()
    const [post] = await db.select().from(posts).where(sql`id = ${postId}`)
    expect(post.status).toBe('published')
    const targets = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(targets[0].status).toBe('published')
    expect(targets[0].remoteId).toBe('remote-1')
  })

  it('never double-processes with two concurrent workers', async () => {
    const fake = new FakeAdapter()
    fake.latencyMs = 50
    await makePost()
    const options = { ...DEFAULT_WORKER_OPTIONS, backoffsMs: [10, 10, 10, 10] }
    const [first, second] = await Promise.all([
      runOnce(db, adaptersFor(fake), TEST_KEY, options),
      runOnce(db, adaptersFor(fake), TEST_KEY, options),
    ])
    expect(first.claimed + second.claimed).toBe(1)
    expect(fake.calls).toHaveLength(1)
  })

  it('backs off retryable failures and eventually fails', async () => {
    const fake = new FakeAdapter()
    fake.script = [{ kind: 'fail', error: new PlatformError('boom', 'retryable') }]
    const postId = await makePost()
    const options = { ...DEFAULT_WORKER_OPTIONS, maxAttempts: 3, backoffsMs: [60_000, 60_000, 60_000] }
    await runOnce(db, adaptersFor(fake), TEST_KEY, options)
    let [target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(target.status).toBe('pending')
    expect(target.attempts).toBe(1)
    expect(target.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now() + 30_000)

    // Force the next attempt due and fail twice more.
    await db.execute(sql`UPDATE post_targets SET next_attempt_at = NOW() WHERE post_id = ${postId}`)
    await runOnce(db, adaptersFor(fake), TEST_KEY, options)
    await db.execute(sql`UPDATE post_targets SET next_attempt_at = NOW() WHERE post_id = ${postId}`)
    const result = await runOnce(db, adaptersFor(fake), TEST_KEY, options)
    expect(result.failed).toBe(1)
    ;[target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(target.status).toBe('failed')
    expect(target.attempts).toBe(3)
    const [post] = await db.select().from(posts).where(sql`id = ${postId}`)
    expect(post.status).toBe('failed')
  })

  it('honors Retry-After over the computed backoff', async () => {
    const fake = new FakeAdapter()
    fake.script = [
      { kind: 'fail', error: new PlatformError('slow', 'retryable', { retryAfterMs: 5_000 }) },
    ]
    const postId = await makePost()
    await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      backoffsMs: [3_600_000, 3_600_000, 3_600_000, 3_600_000],
    })
    const [target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    const waitMs = (target.nextAttemptAt?.getTime() ?? 0) - Date.now()
    expect(waitMs).toBeGreaterThan(1_000)
    expect(waitMs).toBeLessThan(30_000)
  })

  it('recovers stuck jobs and publishes them', async () => {
    const fake = new FakeAdapter()
    const postId = await makePost()
    await db.execute(
      sql`UPDATE post_targets SET status = 'publishing', locked_at = NOW() - INTERVAL '30 minutes' WHERE post_id = ${postId}`,
    )
    const result = await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      backoffsMs: [10, 10, 10, 10],
    })
    expect(result.recovered).toBe(1)
    expect(result.published).toBe(1)
  })

  it('fails overdue posts past the grace window without publishing', async () => {
    const fake = new FakeAdapter()
    await db.insert(postTargets).values({
      postId: (
        await db
          .insert(posts)
          .values({
            body: 'late',
            status: 'scheduled',
            scheduledAt: new Date(Date.now() - 60 * 60_000),
          })
          .returning()
      )[0].id,
      accountId,
      status: 'pending',
      nextAttemptAt: new Date(Date.now() - 1000),
    })
    await db.execute(sql`INSERT INTO settings(key, value) VALUES ('latePublishGraceMinutes', '5')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)
    const result = await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      backoffsMs: [10, 10, 10, 10],
    })
    expect(result.failed).toBe(1)
    expect(fake.calls).toHaveLength(0)
    const [target] = await db.select({ lastError: postTargets.lastError }).from(postTargets)
    expect(target.lastError).toMatch(/grace window/)
  })

  it('serializes publishes per account', async () => {
    const fake = new FakeAdapter()
    fake.latencyMs = 60
    const [second] = await db
      .insert(accounts)
      .values({ platform: 'mastodon', displayName: 'Two', handle: '@two@test', credentialsEncrypted: TEST_CREDS })
      .returning()
    await makePost([accountId, accountId, second.id])
    await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      concurrency: 3,
      backoffsMs: [10, 10, 10, 10],
    })
    expect(fake.calls).toHaveLength(3)
    expect(fake.perAccount.get(accountId)?.max).toBe(1)
    expect(fake.perAccount.get(second.id)?.max).toBe(1)
  })

  it('stores one bluesky rkey per target and reuses it across retries', async () => {
    const fake = new FakeAdapter()
    fake.script = [
      { kind: 'fail', error: new PlatformError('flaky', 'retryable') },
      { kind: 'ok' },
    ]
    const [bsky] = await db
      .insert(accounts)
      .values({ platform: 'bluesky', displayName: 'B', handle: '@b@test', credentialsEncrypted: TEST_CREDS })
      .returning()
    const postId = await makePost([bsky.id])
    const options = { ...DEFAULT_WORKER_OPTIONS, backoffsMs: [10, 10, 10, 10] }
    await runOnce(db, adaptersFor(fake), TEST_KEY, options)
    let [target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(target.rkey).toBeTruthy()
    const firstKey = fake.calls[0].key
    await db.execute(sql`UPDATE post_targets SET next_attempt_at = NOW() WHERE post_id = ${postId}`)
    await runOnce(db, adaptersFor(fake), TEST_KEY, options)
    ;[target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(target.status).toBe('published')
    expect(fake.calls[1].key).toBe(firstKey)
  })

  it('fails permanently and flags needs_reauth on auth errors', async () => {
    const fake = new FakeAdapter()
    fake.script = [{ kind: 'fail', error: new PlatformError('revoked', 'auth') }]
    const postId = await makePost()
    await runOnce(db, adaptersFor(fake), TEST_KEY, {
      ...DEFAULT_WORKER_OPTIONS,
      backoffsMs: [10, 10, 10, 10],
    })
    const [target] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    expect(target.status).toBe('failed')
    const [account] = await db.select().from(accounts).where(sql`id = ${accountId}`)
    expect(account.status).toBe('needs_reauth')
  })

  it('computes backoff within the expected band', () => {
    const delay = backoffForAttempt(1, [30_000, 120_000])
    expect(delay).toBeGreaterThanOrEqual(30_000)
    expect(delay).toBeLessThanOrEqual(36_000)
  })

  it('claimDueTargets only takes due rows', async () => {
    await makePost()
    await db.insert(posts).values({ body: 'future', status: 'scheduled', scheduledAt: new Date() })
    const claimed = await claimDueTargets(db, 10)
    expect(claimed).toHaveLength(1)
    expect(await recoverStuckTargets(db, 60_000)).toBe(0)
  })

  it('publishTarget drops orphan targets of deleted posts', async () => {
    const fake = new FakeAdapter()
    const postId = await makePost()
    const [orphan] = await db.select().from(postTargets).where(sql`post_id = ${postId}`)
    await db.delete(posts).where(sql`id = ${postId}`)
    const outcome = await publishTarget(db, adaptersFor(fake), TEST_KEY, orphan, DEFAULT_WORKER_OPTIONS)
    expect(outcome).toBe('failed')
    expect(fake.calls).toHaveLength(0)
  })
})
