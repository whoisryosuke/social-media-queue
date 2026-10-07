import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { accounts } from '../db/schema.js'
import { postsRoutes } from './posts.js'
import { settingsRoutes } from './settings.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test'

const pool = new Pool({ connectionString: TEST_DATABASE_URL })
const db = createDb(pool)

const app = new Hono()
app.route('/api/posts', postsRoutes(db))
app.route('/api/settings', settingsRoutes(db))

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await app.request(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

let accountId = ''

beforeEach(async () => {
  await db.execute(sql`TRUNCATE posts, media, settings CASCADE`)
  await db.delete(accounts)
  const [account] = await db
    .insert(accounts)
    .values({
      platform: 'mastodon',
      displayName: 'Test',
      handle: '@test@example.social',
      credentialsEncrypted: 'dummy',
    })
    .returning()
  accountId = account.id
})

afterAll(async () => {
  await pool.end()
})

function futureIso(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

describe('post lifecycle', () => {
  it('creates a draft without targets or a date', async () => {
    const { status, body } = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'hello' }),
    })
    expect(status).toBe(201)
    expect((body as { status: string }).status).toBe('draft')
    expect((body as { scheduledAt: null }).scheduledAt).toBeNull()
  })

  it('creates a scheduled post when scheduledAt and targets are given', async () => {
    const { status, body } = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'hi', accountIds: [accountId], scheduledAt: futureIso(60) }),
    })
    expect(status).toBe(201)
    const post = body as { status: string; targets: { status: string; nextAttemptAt: string }[] }
    expect(post.status).toBe('scheduled')
    expect(post.targets).toHaveLength(1)
    expect(post.targets[0].status).toBe('pending')
  })

  it('rejects scheduling without targets', async () => {
    const { status } = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'hi', scheduledAt: futureIso(60) }),
    })
    expect(status).toBe(400)
  })

  it('promotes a draft to scheduled and back', async () => {
    const created = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'draft', accountIds: [accountId] }),
    })
    const id = (created.body as { id: string }).id

    const scheduled = await request(`/api/posts/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt: futureIso(30) }),
    })
    expect(scheduled.status).toBe(200)
    expect((scheduled.body as { status: string }).status).toBe('scheduled')

    const unscheduled = await request(`/api/posts/${id}/unschedule`, { method: 'POST' })
    expect(unscheduled.status).toBe(200)
    expect((unscheduled.body as { status: string }).status).toBe('draft')
  })

  it('rejects scheduling a draft with no targets', async () => {
    const created = await request('/api/posts', { method: 'POST', body: JSON.stringify({ body: 'x' }) })
    const id = (created.body as { id: string }).id
    const { status } = await request(`/api/posts/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ scheduledAt: futureIso(30) }),
    })
    expect(status).toBe(409)
  })

  it('refuses to edit a publishing post', async () => {
    const created = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'x', accountIds: [accountId], scheduledAt: futureIso(30) }),
    })
    const id = (created.body as { id: string }).id
    await db.execute(sql`UPDATE post_targets SET status = 'publishing' WHERE post_id = ${id}`)
    const { status } = await request(`/api/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: 'edited' }),
    })
    expect(status).toBe(409)
  })

  it('retries failed targets and publishes now', async () => {
    const created = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'x', accountIds: [accountId], scheduledAt: futureIso(30) }),
    })
    const id = (created.body as { id: string }).id
    await db.execute(
      sql`UPDATE post_targets SET status = 'failed', last_error = 'boom' WHERE post_id = ${id}`,
    )
    const retried = await request(`/api/posts/${id}/retry`, { method: 'POST' })
    expect(retried.status).toBe(200)
    const targets = (retried.body as { targets: { status: string; nextAttemptAt: string }[] }).targets
    expect(targets[0].status).toBe('pending')

    const now = await request(`/api/posts/${id}/publish-now`, { method: 'POST' })
    expect(now.status).toBe(200)
  })

  it('lists with status and range filters', async () => {
    await request('/api/posts', { method: 'POST', body: JSON.stringify({ body: 'draft one' }) })
    await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'sched', accountIds: [accountId], scheduledAt: futureIso(60) }),
    })
    const drafts = await request('/api/posts?status=draft')
    expect(drafts.status).toBe(200)
    expect((drafts.body as unknown[])).toHaveLength(1)
    const all = await request('/api/posts')
    expect((all.body as unknown[])).toHaveLength(2)
  })

  it('deletes a post and its targets', async () => {
    const created = await request('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'bye', accountIds: [accountId] }),
    })
    const id = (created.body as { id: string }).id
    const deleted = await request(`/api/posts/${id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const fetched = await request(`/api/posts/${id}`)
    expect(fetched.status).toBe(404)
  })
})

describe('settings', () => {
  it('returns defaults and persists patches', async () => {
    const initial = await request('/api/settings')
    expect((initial.body as { timezone: string }).timezone).toBe('UTC')
    const patched = await request('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'America/New_York', latePublishGraceMinutes: 30 }),
    })
    expect((patched.body as { timezone: string }).timezone).toBe('America/New_York')
    expect((patched.body as { latePublishGraceMinutes: number }).latePublishGraceMinutes).toBe(30)
  })
})
