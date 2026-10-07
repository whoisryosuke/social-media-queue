import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { accounts } from '../db/schema.js'
import { mediaFileRoutes, mediaRoutes } from './media.js'
import { postsRoutes } from './posts.js'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test'

const pool = new Pool({ connectionString: TEST_DATABASE_URL })
const db = createDb(pool)

let storageDir = ''

const app = new Hono()
app.route('/api/posts', postsRoutes(db))
app.route('/api/media', mediaRoutes(db, { get storageDir() { return storageDir }, maxUploadMB: 25 }))
app.route('/media', mediaFileRoutes(db))

const tinyApp = new Hono()
tinyApp.route(
  '/api/media',
  mediaRoutes(db, { get storageDir() { return storageDir }, maxUploadMB: 0.000001 }),
)

beforeEach(async () => {
  await db.execute(sql`TRUNCATE posts, media, settings CASCADE`)
  await db.delete(accounts)
  if (storageDir !== '') await rm(storageDir, { recursive: true, force: true })
  storageDir = await mkdtemp(path.join(tmpdir(), 'scheduler-media-test-'))
})

afterAll(async () => {
  if (storageDir !== '') await rm(storageDir, { recursive: true, force: true })
  await pool.end()
})

async function upload(
  target: Hono,
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<{ status: number; body: unknown }> {
  const form = new FormData()
  form.append('file', new File([bytes as BlobPart], filename, { type: mime }))
  const response = await target.request('/api/media', { method: 'POST', body: form })
  return { status: response.status, body: await response.json().catch(() => null) }
}

async function makePng(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toBuffer(),
  )
}

function makeMp4(): Uint8Array {
  const buffer = Buffer.alloc(32)
  buffer.writeUInt32BE(24, 0)
  buffer.write('ftyp', 4)
  return new Uint8Array(buffer)
}

describe('media upload', () => {
  it('stores an image with extracted dimensions and serves it back', async () => {
    const png = await makePng()
    const { status, body } = await upload(app, png, 'red.png', 'image/png')
    expect(status).toBe(201)
    const created = body as { id: string; width: number; height: number; url: string; mime: string }
    expect(created.width).toBe(2)
    expect(created.height).toBe(2)
    expect(created.url).toBe(`/media/${created.id}`)

    const served = await app.request(created.url)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
  })

  it('stores a video by magic bytes', async () => {
    const { status, body } = await upload(app, makeMp4(), 'clip.mp4', 'video/mp4')
    expect(status).toBe(201)
    expect((body as { mime: string }).mime).toBe('video/mp4')
  })

  it('rejects unsupported types, corrupt files and oversize uploads', async () => {
    const text = await upload(app, new TextEncoder().encode('hello'), 'a.txt', 'text/plain')
    expect(text.status).toBe(415)

    const corrupt = await upload(app, new TextEncoder().encode('not an image'), 'x.png', 'image/png')
    expect(corrupt.status).toBe(422)

    const fakeVideo = await upload(
      app,
      new TextEncoder().encode('not a video either'),
      'x.mp4',
      'video/mp4',
    )
    expect(fakeVideo.status).toBe(422)

    const png = await makePng()
    const tooBig = await upload(tinyApp, png, 'red.png', 'image/png')
    expect(tooBig.status).toBe(413)
  })

  it('refuses to delete attached media but deletes unattached media', async () => {
    const png = await makePng()
    const { body } = await upload(app, png, 'red.png', 'image/png')
    const mediaId = (body as { id: string }).id

    const [account] = await db
      .insert(accounts)
      .values({ platform: 'bluesky', displayName: 'T', handle: '@t.test', credentialsEncrypted: 'x' })
      .returning()
    const created = await app.request('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'with media', accountIds: [account.id] }),
    })
    const postId = ((await created.json()) as { id: string }).id
    await app.request(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media: [{ mediaId, altText: 'red square' }] }),
    })

    const blocked = await app.request(`/api/media/${mediaId}`, { method: 'DELETE' })
    expect(blocked.status).toBe(409)

    await app.request(`/api/posts/${postId}`, { method: 'DELETE' })
    const deleted = await app.request(`/api/media/${mediaId}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const gone = await app.request(`/media/${mediaId}`)
    expect(gone.status).toBe(404)
  })
})
