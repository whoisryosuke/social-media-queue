import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { accounts } from '../db/schema.js'
import { accountsRoutes, oauthRoutes } from '../api/accounts.js'
import { MockPlatformAdapter, isMockMode } from './mock.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test'
const ENCRYPTION_KEY = randomBytes(32).toString('base64')

const pool = new Pool({ connectionString: TEST_DATABASE_URL })
const db = createDb(pool)

const config = {
  encryptionKey: ENCRYPTION_KEY,
  apiOrigin: 'http://localhost:4000',
  webOrigin: 'http://localhost:4321',
}

const app = new Hono()
app.route('/api/accounts', accountsRoutes(db, config))
app.route('/oauth', oauthRoutes(db, config))

beforeAll(() => {
  process.env.MOCK_PLATFORMS = 'true'
  expect(isMockMode()).toBe(true)
})

afterAll(async () => {
  delete process.env.MOCK_PLATFORMS
  await pool.end()
})

beforeEach(async () => {
  await db.execute(sql`TRUNCATE posts, media, settings, mastodon_apps CASCADE`)
  await db.delete(accounts)
})

afterEach(() => {
  delete process.env.MOCK_PLATFORMS
  process.env.MOCK_PLATFORMS = 'true'
})

describe('mock platforms', () => {
  it('connects a bluesky account without network', async () => {
    const response = await app.request('/api/accounts/bluesky', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'mock.test', appPassword: 'fake' }),
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as { handle: string; status: string }
    expect(created.handle).toBe('@mock.test')
    expect(created.status).toBe('active')
  })

  it('runs the mastodon flow against the local callback', async () => {
    const started = await app.request('/api/accounts/mastodon/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instanceUrl: 'mock.instance' }),
    })
    expect(started.status).toBe(200)
    const { authorizeUrl } = (await started.json()) as { authorizeUrl: string }
    expect(authorizeUrl).toContain('/oauth/mastodon/callback?code=mock-code')

    const callbackUrl = new URL(authorizeUrl)
    const callback = await app.request(`${callbackUrl.pathname}${callbackUrl.search}`)
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toContain('/accounts?connected=mastodon')

    const listed = (await (await app.request('/api/accounts')).json()) as { handle: string }[]
    expect(listed).toHaveLength(1)
    expect(listed[0].handle).toContain('mockuser')
  })

  it('publishes through the mock adapter without network', async () => {
    const adapter = new MockPlatformAdapter('mastodon')
    const result = await adapter.publish(
      { id: 'a', platform: 'mastodon', instanceUrl: null, credentials: {} },
      { text: 'hi', media: [] },
      { idempotencyKey: 'target-1' },
    )
    expect(result.remoteId).toBe('mock-target-1')
  })
})
