import { Hono, type Context } from 'hono'
import {
  createPostSchema,
  derivePostStatus,
  listPostsQuerySchema,
  schedulePostSchema,
  updatePostSchema,
  type Post,
  type PostTarget,
  type TargetStatus,
} from '@social-scheduler/shared'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { media, postMedia, postTargets, posts } from '../db/schema.js'

function error(c: Context, message: string, status = 400): Response {
  return c.json({ error: message }, status as 400)
}

async function getFullPost(db: Database, id: string): Promise<Post | null> {
  const [post] = await db.select().from(posts).where(eq(posts.id, id))
  if (post === undefined) return null
  const targets = await db.select().from(postTargets).where(eq(postTargets.postId, id))
  const attachments = await db
    .select()
    .from(postMedia)
    .where(eq(postMedia.postId, id))
    .orderBy(asc(postMedia.position))
  const mediaDetails = []
  for (const attachment of attachments) {
    const [item] = await db.select().from(media).where(eq(media.id, attachment.mediaId))
    mediaDetails.push({
      mediaId: attachment.mediaId,
      position: attachment.position,
      altText: attachment.altText,
      url: item === undefined ? '' : `/media/${item.id}`,
      mime: item?.mime ?? '',
    })
  }
  return {
    id: post.id,
    status: post.status,
    body: post.body,
    scheduledAt: post.scheduledAt,
    targets: targets.map(toTargetDto),
    media: mediaDetails,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

function toTargetDto(target: typeof postTargets.$inferSelect): PostTarget {
  return {
    id: target.id,
    postId: target.postId,
    accountId: target.accountId,
    bodyOverride: target.bodyOverride,
    rkey: target.rkey,
    status: target.status,
    attempts: target.attempts,
    nextAttemptAt: target.nextAttemptAt,
    remoteId: target.remoteId,
    remoteUrl: target.remoteUrl,
    lastError: target.lastError,
    publishedAt: target.publishedAt,
  }
}

async function recomputePostStatus(db: Database, postId: string): Promise<void> {
  const targets = await db.select().from(postTargets).where(eq(postTargets.postId, postId))
  const statuses: TargetStatus[] = targets.map((target) => target.status)
  await db
    .update(posts)
    .set({ status: derivePostStatus(statuses), updatedAt: new Date() })
    .where(eq(posts.id, postId))
}

async function assertMediaExist(db: Database, mediaIds: string[]): Promise<string | null> {
  if (mediaIds.length === 0) return null
  const rows = await db.select({ id: media.id }).from(media).where(inArray(media.id, mediaIds))
  const found = new Set(rows.map((row) => row.id))
  return mediaIds.find((mediaId) => !found.has(mediaId)) ?? null
}

export function postsRoutes(db: Database): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => {
    const parsed = listPostsQuerySchema.safeParse({
      status: c.req.query('status'),
      from: c.req.query('from'),
      to: c.req.query('to'),
    })
    if (!parsed.success) return error(c, parsed.error.message)
    const { status, from, to } = parsed.data
    const conditions = []
    if (status !== undefined) conditions.push(eq(posts.status, status))
    if (from !== undefined) conditions.push(gte(posts.scheduledAt, new Date(from)))
    if (to !== undefined) conditions.push(lte(posts.scheduledAt, new Date(to)))
    const rows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(posts.scheduledAt))
    const full = []
    for (const row of rows) {
      const post = await getFullPost(db, row.id)
      if (post !== null) full.push(post)
    }
    return c.json(full)
  })

  routes.post('/', async (c) => {
    const parsed = createPostSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    const input = parsed.data
    if (input.scheduledAt !== undefined && (input.accountIds ?? []).length === 0) {
      return error(c, 'Scheduling requires at least one target account')
    }
    if (input.media !== undefined) {
      const missing = await assertMediaExist(
        db,
        input.media.map((attachment) => attachment.mediaId),
      )
      if (missing !== null) return error(c, `Unknown media: ${missing}`, 404)
    }
    const [post] = await db
      .insert(posts)
      .values({
        body: input.body,
        status: input.scheduledAt !== undefined ? 'scheduled' : 'draft',
        scheduledAt: input.scheduledAt !== undefined ? new Date(input.scheduledAt) : null,
      })
      .returning()
    for (const accountId of input.accountIds ?? []) {
      await db.insert(postTargets).values({
        postId: post.id,
        accountId,
        bodyOverride: input.bodyOverrides?.[accountId] ?? null,
        status: 'pending',
        nextAttemptAt: input.scheduledAt !== undefined ? new Date(input.scheduledAt) : null,
      })
    }
    for (const [position, attachment] of (input.media ?? []).entries()) {
      await db.insert(postMedia).values({
        postId: post.id,
        mediaId: attachment.mediaId,
        position,
        altText: attachment.altText ?? null,
      })
    }
    return c.json(await getFullPost(db, post.id), 201)
  })

  routes.get('/:id', async (c) => {
    const post = await getFullPost(db, c.req.param('id'))
    if (post === null) return error(c, 'Post not found', 404)
    return c.json(post)
  })

  routes.patch('/:id', async (c) => {
    const parsed = updatePostSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    const input = parsed.data
    const existing = await getFullPost(db, c.req.param('id'))
    if (existing === null) return error(c, 'Post not found', 404)
    if (existing.status === 'publishing' || existing.targets.some((t) => t.status === 'publishing')) {
      return error(c, 'Post is publishing and cannot be edited', 409)
    }

    if (input.body !== undefined) {
      await db.update(posts).set({ body: input.body, updatedAt: new Date() }).where(eq(posts.id, existing.id))
    }

    if (input.accountIds !== undefined) {
      const current = new Map(existing.targets.map((t) => [t.accountId, t]))
      const wanted = new Set(input.accountIds)
      for (const target of existing.targets) {
        if (!wanted.has(target.accountId)) {
          if (target.status === 'published') {
            return error(c, 'Cannot remove an already-published target', 409)
          }
          await db.delete(postTargets).where(eq(postTargets.id, target.id))
        }
      }
      for (const accountId of input.accountIds) {
        const target = current.get(accountId)
        const override = input.bodyOverrides?.[accountId] ?? target?.bodyOverride ?? null
        if (target === undefined) {
          await db.insert(postTargets).values({
            postId: existing.id,
            accountId,
            bodyOverride: input.bodyOverrides?.[accountId] ?? null,
            status: 'pending',
            nextAttemptAt: existing.scheduledAt,
          })
        } else if (input.bodyOverrides !== undefined) {
          await db.update(postTargets).set({ bodyOverride: override }).where(eq(postTargets.id, target.id))
        }
      }
    } else if (input.bodyOverrides !== undefined && input.bodyOverrides !== null) {
      for (const target of existing.targets) {
        if (target.accountId in input.bodyOverrides) {
          await db
            .update(postTargets)
            .set({ bodyOverride: input.bodyOverrides[target.accountId] })
            .where(eq(postTargets.id, target.id))
        }
      }
    }

    if (input.media !== undefined) {
      const missing = await assertMediaExist(
        db,
        input.media.map((attachment) => attachment.mediaId),
      )
      if (missing !== null) return error(c, `Unknown media: ${missing}`, 404)
      await db.delete(postMedia).where(eq(postMedia.postId, existing.id))
      for (const [position, attachment] of input.media.entries()) {
        await db.insert(postMedia).values({
          postId: existing.id,
          mediaId: attachment.mediaId,
          position,
          altText: attachment.altText ?? null,
        })
      }
    }

    if (input.scheduledAt !== undefined) {
      if (input.scheduledAt === null) {
        if (existing.status !== 'draft') return error(c, 'Use unschedule to move a post back to drafts')
      } else {
        const scheduledAt = new Date(input.scheduledAt)
        const refreshed = await getFullPost(db, existing.id)
        if (refreshed === null) return error(c, 'Post not found', 404)
        if (refreshed.targets.length === 0) {
          return error(c, 'Scheduling requires at least one target account')
        }
        await db
          .update(posts)
          .set({ scheduledAt, status: 'scheduled', updatedAt: new Date() })
          .where(eq(posts.id, existing.id))
        for (const target of refreshed.targets) {
          if (target.status === 'pending') {
            await db
              .update(postTargets)
              .set({ nextAttemptAt: scheduledAt })
              .where(eq(postTargets.id, target.id))
          }
        }
      }
    }

    const after = await getFullPost(db, existing.id)
    if (after !== null && after.status !== 'draft') await recomputePostStatus(db, existing.id)
    return c.json(await getFullPost(db, existing.id))
  })

  routes.post('/:id/schedule', async (c) => {
    const parsed = schedulePostSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    const existing = await getFullPost(db, c.req.param('id'))
    if (existing === null) return error(c, 'Post not found', 404)
    if (existing.status !== 'draft') return error(c, 'Only drafts can be scheduled', 409)
    if (existing.targets.length === 0) {
      return error(c, 'Scheduling requires at least one target account', 409)
    }
    const scheduledAt = new Date(parsed.data.scheduledAt)
    await db
      .update(posts)
      .set({ scheduledAt, status: 'scheduled', updatedAt: new Date() })
      .where(eq(posts.id, existing.id))
    for (const target of existing.targets) {
      if (target.status !== 'published') {
        await db
          .update(postTargets)
          .set({ status: 'pending', nextAttemptAt: scheduledAt, lastError: null })
          .where(eq(postTargets.id, target.id))
      }
    }
    await recomputePostStatus(db, existing.id)
    return c.json(await getFullPost(db, existing.id))
  })

  routes.post('/:id/unschedule', async (c) => {
    const existing = await getFullPost(db, c.req.param('id'))
    if (existing === null) return error(c, 'Post not found', 404)
    if (existing.status !== 'scheduled') return error(c, 'Only scheduled posts can be moved to drafts', 409)
    await db
      .update(posts)
      .set({ scheduledAt: null, status: 'draft', updatedAt: new Date() })
      .where(eq(posts.id, existing.id))
    for (const target of existing.targets) {
      if (target.status === 'pending') {
        await db.update(postTargets).set({ nextAttemptAt: null }).where(eq(postTargets.id, target.id))
      }
    }
    return c.json(await getFullPost(db, existing.id))
  })

  routes.post('/:id/publish-now', async (c) => {
    const existing = await getFullPost(db, c.req.param('id'))
    if (existing === null) return error(c, 'Post not found', 404)
    if (existing.status === 'publishing' || existing.targets.some((t) => t.status === 'publishing')) {
      return error(c, 'Post is already publishing', 409)
    }
    if (existing.targets.length === 0) {
      return error(c, 'Publishing requires at least one target account', 409)
    }
    const now = new Date()
    await db
      .update(posts)
      .set({ scheduledAt: now, status: 'scheduled', updatedAt: now })
      .where(eq(posts.id, existing.id))
    for (const target of existing.targets) {
      if (target.status !== 'published') {
        await db
          .update(postTargets)
          .set({ status: 'pending', nextAttemptAt: now, lastError: null })
          .where(eq(postTargets.id, target.id))
      }
    }
    await recomputePostStatus(db, existing.id)
    return c.json(await getFullPost(db, existing.id))
  })

  routes.post('/:id/retry', async (c) => {
    const existing = await getFullPost(db, c.req.param('id'))
    if (existing === null) return error(c, 'Post not found', 404)
    const now = new Date()
    let reset = 0
    for (const target of existing.targets) {
      if (target.status === 'failed') {
        await db
          .update(postTargets)
          .set({ status: 'pending', nextAttemptAt: now, lastError: null })
          .where(eq(postTargets.id, target.id))
        reset += 1
      }
    }
    if (reset === 0) return error(c, 'No failed targets to retry', 409)
    await recomputePostStatus(db, existing.id)
    return c.json(await getFullPost(db, existing.id))
  })

  routes.delete('/:id', async (c) => {
    const existing = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, c.req.param('id')))
    if (existing.length === 0) return error(c, 'Post not found', 404)
    await db.delete(posts).where(eq(posts.id, c.req.param('id')))
    return c.json({ ok: true })
  })

  return routes
}
