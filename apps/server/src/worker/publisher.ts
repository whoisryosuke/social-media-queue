import { derivePostStatus, type TargetStatus } from '@social-scheduler/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import pino from 'pino'
import { decrypt } from '../crypto.js'
import type { Database } from '../db/client.js'
import { readSettings } from '../api/settings.js'
import { accounts, media, postMedia, postTargets, posts } from '../db/schema.js'
import { BlueskyAdapter } from '../platforms/bluesky/adapter.js'
import { MastodonAdapter } from '../platforms/mastodon/adapter.js'
import { MockPlatformAdapter, isMockMode } from '../platforms/mock.js'
import { nextRkey } from '../platforms/bluesky/client.js'
import { PlatformError, type PlatformAdapter, type PublishMedia, type ResolvedAccount } from '../platforms/types.js'

export const log = pino({ name: 'worker' })

export interface WorkerOptions {
  batchSize: number
  maxAttempts: number
  /** Backoff per consecutive failure (index 0 = after 1st failure). */
  backoffsMs: number[]
  stuckAfterMs: number
  concurrency: number
}

export const DEFAULT_WORKER_OPTIONS: WorkerOptions = {
  batchSize: 10,
  maxAttempts: 5,
  backoffsMs: [30_000, 120_000, 600_000, 3_600_000],
  stuckAfterMs: 10 * 60_000,
  concurrency: 3,
}

export type AdapterMap = Record<'mastodon' | 'bluesky', PlatformAdapter>

export function createAdapters(): AdapterMap {
  if (isMockMode()) {
    return { mastodon: new MockPlatformAdapter('mastodon'), bluesky: new MockPlatformAdapter('bluesky') }
  }
  return { mastodon: new MastodonAdapter(), bluesky: new BlueskyAdapter() }
}

type TargetRow = typeof postTargets.$inferSelect

interface RawTargetRow {
  id: string
  post_id: string
  account_id: string
  body_override: string | null
  status: TargetRow['status']
  attempts: number
  next_attempt_at: Date | null
  locked_at: Date | null
  rkey: string | null
  remote_id: string | null
  remote_url: string | null
  last_error: string | null
  published_at: Date | null
}

function toTargetRow(raw: RawTargetRow): TargetRow {
  return {
    id: raw.id,
    postId: raw.post_id,
    accountId: raw.account_id,
    bodyOverride: raw.body_override,
    status: raw.status,
    attempts: raw.attempts,
    nextAttemptAt: raw.next_attempt_at,
    lockedAt: raw.locked_at,
    rkey: raw.rkey,
    remoteId: raw.remote_id,
    remoteUrl: raw.remote_url,
    lastError: raw.last_error,
    publishedAt: raw.published_at,
  }
}

export function backoffForAttempt(attempts: number, backoffsMs: number[]): number {
  const base = backoffsMs[Math.min(Math.max(attempts - 1, 0), backoffsMs.length - 1)]
  const jitter = base * 0.2 * Math.random()
  return Math.floor(base + jitter)
}

/** Resets targets stuck in `publishing` past the lock timeout back to `pending`. */
export async function recoverStuckTargets(db: Database, stuckAfterMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - stuckAfterMs)
  const stuck = await db.execute(
    sql`UPDATE post_targets SET status = 'pending', locked_at = NULL
        WHERE status = 'publishing' AND locked_at IS NOT NULL AND locked_at < ${cutoff}
        RETURNING id`,
  )
  return stuck.rowCount ?? 0
}

export async function claimDueTargets(db: Database, limit: number): Promise<TargetRow[]> {
  const claimed = await db.execute(sql`
    UPDATE post_targets SET status = 'publishing', locked_at = NOW()
    WHERE id IN (
      SELECT id FROM post_targets
      WHERE status = 'pending'
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`)
  const rows = claimed.rows as unknown as RawTargetRow[]
  return rows.map(toTargetRow)
}

async function recomputePost(db: Database, postId: string): Promise<void> {
  const targets = await db.select().from(postTargets).where(eq(postTargets.postId, postId))
  const statuses: TargetStatus[] = targets.map((target) => target.status)
  await db
    .update(posts)
    .set({ status: derivePostStatus(statuses), updatedAt: new Date() })
    .where(eq(posts.id, postId))
}

async function failTarget(
  db: Database,
  target: TargetRow,
  message: string,
  attemptConsumed: boolean,
): Promise<void> {
  await db
    .update(postTargets)
    .set({
      status: 'failed',
      lastError: message,
      lockedAt: null,
      ...(attemptConsumed ? { attempts: target.attempts + 1 } : {}),
    })
    .where(eq(postTargets.id, target.id))
  await recomputePost(db, target.postId)
}

export async function publishTarget(
  db: Database,
  adapters: AdapterMap,
  encryptionKey: string,
  target: TargetRow,
  options: WorkerOptions,
): Promise<'published' | 'failed' | 'deferred'> {
  const attempt = target.attempts + 1
  const targetLog = log.child({ targetId: target.id, attempt })

  const [post] = await db.select().from(posts).where(eq(posts.id, target.postId))
  if (post === undefined) {
    // Post was deleted after claiming; drop the orphan target.
    await db.delete(postTargets).where(eq(postTargets.id, target.id))
    return 'failed'
  }
  const [accountRow] = await db.select().from(accounts).where(eq(accounts.id, target.accountId))
  if (accountRow === undefined) {
    await failTarget(db, target, 'Account was removed', false)
    return 'failed'
  }
  if (accountRow.status === 'needs_reauth') {
    // Leave for the user to reconnect; do not burn attempts.
    await db
      .update(postTargets)
      .set({ status: 'pending', lockedAt: null })
      .where(eq(postTargets.id, target.id))
    await recomputePost(db, target.postId)
    return 'deferred'
  }

  const settings = await readSettings(db)
  if (
    settings.latePublishGraceMinutes !== null &&
    post.scheduledAt !== null &&
    Date.now() - post.scheduledAt.getTime() > settings.latePublishGraceMinutes * 60_000
  ) {
    await failTarget(db, target, 'Missed schedule: grace window exceeded', false)
    return 'failed'
  }

  let credentials: Record<string, string>
  try {
    credentials = JSON.parse(decrypt(accountRow.credentialsEncrypted, encryptionKey)) as Record<string, string>
  } catch {
    await failTarget(db, target, 'Stored credentials are unreadable', false)
    return 'failed'
  }
  const resolved: ResolvedAccount = {
    id: accountRow.id,
    platform: accountRow.platform,
    instanceUrl: accountRow.instanceUrl,
    credentials,
  }

  const attachments = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, post.id))
    .orderBy(asc(postMedia.position))
  const contentMedia: PublishMedia[] = []
  for (const attachment of attachments) {
    const [item] = await db.select().from(media).where(eq(media.id, attachment.mediaId))
    if (item === undefined) {
      await failTarget(db, target, 'Attached media was removed', false)
      return 'failed'
    }
    let buffer: Uint8Array
    try {
      buffer = new Uint8Array(await readFile(item.storagePath))
    } catch {
      await failTarget(db, target, 'Attached file is missing from storage', false)
      return 'failed'
    }
    contentMedia.push({
      buffer,
      mime: item.mime,
      filename: item.originalFilename,
      altText: attachment.altText,
    })
  }

  let idempotencyKey = target.id
  if (accountRow.platform === 'bluesky') {
    // Bluesky posts require TID rkeys; one TID per target, stored once and
    // reused across retries so a retry overwrites instead of duplicating.
    if (target.rkey === null) {
      const rkey = nextRkey()
      await db.update(postTargets).set({ rkey }).where(eq(postTargets.id, target.id))
      idempotencyKey = rkey
    } else {
      idempotencyKey = target.rkey
    }
  }

  targetLog.info({ accountId: accountRow.id, platform: accountRow.platform }, 'publishing target')
  try {
    const result = await adapters[accountRow.platform].publish(
      resolved,
      { text: target.bodyOverride ?? post.body, media: contentMedia },
      { idempotencyKey },
    )
    await db
      .update(postTargets)
      .set({
        status: 'published',
        attempts: target.attempts + 1,
        lockedAt: null,
        remoteId: result.remoteId,
        remoteUrl: result.url,
        lastError: null,
        publishedAt: new Date(),
      })
      .where(eq(postTargets.id, target.id))
    await recomputePost(db, target.postId)
    targetLog.info({ remoteUrl: result.url }, 'target published')
    return 'published'
  } catch (error) {
    if (error instanceof PlatformError && error.kind === 'auth') {
      await db
        .update(accounts)
        .set({ status: 'needs_reauth', updatedAt: new Date() })
        .where(eq(accounts.id, accountRow.id))
      await failTarget(db, target, `Authentication failed: ${error.message}`, true)
      return 'failed'
    }
    if (error instanceof PlatformError && error.kind === 'retryable') {
      if (target.attempts + 1 >= options.maxAttempts) {
        await failTarget(db, target, `Gave up after ${options.maxAttempts} attempts: ${error.message}`, true)
        return 'failed'
      }
      const delay = error.retryAfterMs ?? backoffForAttempt(target.attempts + 1, options.backoffsMs)
      await db
        .update(postTargets)
        .set({
          status: 'pending',
          attempts: target.attempts + 1,
          lockedAt: null,
          nextAttemptAt: new Date(Date.now() + delay),
          lastError: error.message,
        })
        .where(eq(postTargets.id, target.id))
      await recomputePost(db, target.postId)
      targetLog.info({ nextAttemptInMs: delay }, 'target failed, will retry')
      return 'deferred'
    }
    await failTarget(db, target, error instanceof Error ? error.message : String(error), true)
    return 'failed'
  }
}

/** Runs one worker pass: recover stuck, claim due, publish with per-account serialization. */
export async function runOnce(
  db: Database,
  adapters: AdapterMap,
  encryptionKey: string,
  options: WorkerOptions = DEFAULT_WORKER_OPTIONS,
): Promise<{ recovered: number; claimed: number; published: number; failed: number }> {
  const recovered = await recoverStuckTargets(db, options.stuckAfterMs)
  const claimed = await claimDueTargets(db, options.batchSize)
  // Parents of claimed targets read as `publishing` immediately.
  for (const postId of new Set(claimed.map((target) => target.postId))) {
    await recomputePost(db, postId)
  }

  const byAccount = new Map<string, TargetRow[]>()
  for (const target of claimed) {
    const group = byAccount.get(target.accountId) ?? []
    group.push(target)
    byAccount.set(target.accountId, group)
  }

  let published = 0
  let failed = 0
  const groups = [...byAccount.values()]
  const running: Promise<void>[] = []
  const next = async (): Promise<void> => {
    const group = groups.shift()
    if (group === undefined) return
    for (const target of group) {
      const outcome = await publishTarget(db, adapters, encryptionKey, target, options)
      if (outcome === 'published') published += 1
      else if (outcome === 'failed') failed += 1
    }
    await next()
  }
  for (let i = 0; i < Math.min(options.concurrency, groups.length); i += 1) {
    running.push(next())
  }
  await Promise.all(running)
  return { recovered, claimed: claimed.length, published, failed }
}
