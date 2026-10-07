import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb } from '../db/client.js'
import { accounts } from '../db/schema.js'
import { accountsRoutes, oauthRoutes } from './accounts.js'
import { createApp } from './index.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test'
const ENCRYPTION_KEY = randomBytes(32).toString('base64')

const pool = new Pool({ connectionString: TEST_DATABASE_URL })
const db = createDb(pool)

const config = {
  encryptionKey: ENCRYPTION_KEY,
  apiOrigin: 'http://localhost:4000',
  webOrigin: 'http://localhost:4321,http://localhost:4322',
}

const app = new Hono()
app.route('/api/accounts', accountsRoutes(db, config))
app.route('/oauth', oauthRoutes(db, config))

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const INSTANCE = {
  apps: { client_id: 'cid', client_secret: 'csec' },
  token: { access_token: 'tok123' },
  verify: {
    id: '42',
    username: 'alice',
    acct: 'alice',
    display_name: 'Alice',
    avatar: 'https://cdn/ava.png',
  },
  instance: {
    configuration: {
      statuses: { max_characters: 500, max_media_attachments: 4 },
      media_attachments: {
        supported_mime_types: ['image/jpeg', 'video/mp4'],
        image_size_limit: 1_000_000,
        video_size_limit: 2_000_000,
      },
    },
  },
  status: { id: 's1', url: 'https://mastodon.social/@alice/1' },
}

function stubInstance(failVerify = false): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/apps')) return jsonResponse(INSTANCE.apps)
      if (url.endsWith('/oauth/token')) return jsonResponse(INSTANCE.token)
      if (url.endsWith('/api/v1/accounts/verify_credentials')) {
        return failVerify ? jsonResponse({ error: 'The access token is invalid' }, 401) : jsonResponse(INSTANCE.verify)
      }
      if (url.endsWith('/api/v2/instance')) return jsonResponse(INSTANCE.instance)
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE posts, media, settings, mastodon_apps CASCADE`)
  await db.delete(accounts)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await pool.end()
})

async function start(instanceUrl: string): Promise<{ status: number; body: unknown }> {
  const response = await app.request('/api/accounts/mastodon/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instanceUrl }),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

describe('cors', () => {
  it('answers preflights for every configured web origin', async () => {
    const corsApp = createApp('http://localhost:4321,http://localhost:4322', db, {
      storageDir: '',
      maxUploadMB: 25,
      encryptionKey: ENCRYPTION_KEY,
      apiOrigin: 'http://localhost:4000',
      webOrigin: 'http://localhost:4321',
    })
    for (const origin of ['http://localhost:4321', 'http://localhost:4322']) {
      const preflight = await corsApp.request('/api/accounts/mastodon/start', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
      })
      expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
    }
    const denied = await corsApp.request('/api/accounts/mastodon/start', {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })
})
describe('mastodon connect flow', () => {
  it('starts OAuth with a cached app registration', async () => {
    stubInstance()
    const first = await start('mastodon.social')
    expect(first.status).toBe(200)
    expect((first.body as { authorizeUrl: string }).authorizeUrl).toContain('/oauth/authorize?')

    const second = await start('https://mastodon.social/')
    expect(second.status).toBe(200)
  })

  it('rejects invalid instance URLs', async () => {
    const { status } = await start('http://insecure.example')
    expect(status).toBe(400)
  })

  it('redirects failures to the originating web host, never the raw list', async () => {
    const bad = await app.request(
      '/oauth/mastodon/callback?code=x&state=http://insecure.example|http://localhost:4322',
    )
    expect(bad.status).toBe(302)
    expect(bad.headers.get('location')).toMatch(/^http:\/\/localhost:4322\/accounts\?error=/)

    const fallback = await app.request('/oauth/mastodon/callback?code=x&state=http://insecure.example')
    expect(fallback.headers.get('location')).toMatch(/^http:\/\/localhost:4321\/accounts\?error=/)
  })

  it('completes the callback and stores the account with limits', async () => {
    stubInstance()
    const callback = await app.request(
      '/oauth/mastodon/callback?code=authcode&state=https://mastodon.social',
    )
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('http://localhost:4321/accounts?connected=mastodon')

    const listed = await app.request('/api/accounts')
    const all = (await listed.json()) as {
      handle: string
      displayName: string
      limits: { maxChars: number } | null
      status: string
    }[]
    expect(all).toHaveLength(1)
    expect(all[0].handle).toBe('@alice@mastodon.social')
    expect(all[0].limits?.maxChars).toBe(500)
    expect(all[0].status).toBe('active')
  })

  it('marks the account needs_reauth when refresh fails with 401', async () => {
    stubInstance()
    await app.request('/oauth/mastodon/callback?code=authcode&state=https://mastodon.social')
    const listed = (await (await app.request('/api/accounts')).json()) as { id: string }[]

    stubInstance(true)
    const refreshed = await app.request(`/api/accounts/${listed[0].id}/refresh`, { method: 'POST' })
    expect(refreshed.status).toBe(200)
    expect(((await refreshed.json()) as { status: string }).status).toBe('needs_reauth')
  })

  it('deletes accounts', async () => {
    stubInstance()
    await app.request('/oauth/mastodon/callback?code=authcode&state=https://mastodon.social')
    const listed = (await (await app.request('/api/accounts')).json()) as { id: string }[]
    const deleted = await app.request(`/api/accounts/${listed[0].id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const after = (await (await app.request('/api/accounts')).json()) as unknown[]
    expect(after).toHaveLength(0)
  })
})
