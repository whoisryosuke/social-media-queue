import { Hono, type Context } from 'hono'
import type { Media } from '@social-scheduler/shared'
import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import type { Database } from '../db/client.js'
import { media, postMedia } from '../db/schema.js'
import { classifyMime, removeFile, sniffVideo, storagePathFor, storeBuffer } from '../media/storage.js'

export interface MediaConfig {
  storageDir: string
  maxUploadMB: number
}

function error(c: Context, message: string, status = 400): Response {
  return c.json({ error: message }, status as 400)
}

function toMediaDto(row: typeof media.$inferSelect): Media {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    originalFilename: row.originalFilename,
    url: `/media/${row.id}`,
    createdAt: row.createdAt,
  }
}

export function mediaRoutes(db: Database, config: MediaConfig): Hono {
  const routes = new Hono()

  routes.post('/', async (c) => {
    const form = await c.req.parseBody().catch(() => null)
    const file = form?.['file']
    if (!(file instanceof File)) return error(c, 'Multipart field "file" is required')
    const maxBytes = Math.floor(config.maxUploadMB * 1024 * 1024)
    if (file.size > maxBytes) {
      return error(c, `File exceeds the ${config.maxUploadMB} MB upload limit`, 413)
    }
    if (file.size === 0) return error(c, 'File is empty')
    const classified = classifyMime(file.type)
    if (classified === null) return error(c, `Unsupported media type: ${file.type || 'unknown'}`, 415)

    const buffer = new Uint8Array(await file.arrayBuffer())
    let width: number | null = null
    let height: number | null = null
    if (classified.kind === 'image') {
      try {
        const metadata = await sharp(buffer).metadata()
        width = metadata.width ?? null
        height = metadata.height ?? null
      } catch {
        return error(c, 'File is not a readable image', 422)
      }
    } else if (!sniffVideo(buffer, file.type)) {
      return error(c, 'File is not a readable video', 422)
    }

    const [row] = await db
      .insert(media)
      .values({
        kind: classified.kind,
        mime: file.type,
        sizeBytes: file.size,
        width,
        height,
        durationMs: null,
        storagePath: '',
        originalFilename: file.name || 'upload',
      })
      .returning()
    const storagePath = storagePathFor(config.storageDir, row.id, classified.extension)
    await storeBuffer(storagePath, buffer)
    const [saved] = await db
      .update(media)
      .set({ storagePath })
      .where(eq(media.id, row.id))
      .returning()
    return c.json(toMediaDto(saved), 201)
  })

  routes.delete('/:id', async (c) => {
    const [row] = await db.select().from(media).where(eq(media.id, c.req.param('id')))
    if (row === undefined) return error(c, 'Media not found', 404)
    const attached = await db
      .select({ postId: postMedia.postId })
      .from(postMedia)
      .where(eq(postMedia.mediaId, row.id))
    if (attached.length > 0) return error(c, 'Media is attached to a post', 409)
    await removeFile(row.storagePath)
    await db.delete(media).where(eq(media.id, row.id))
    return c.json({ ok: true })
  })

  return routes
}

/** Serves stored files. Mounted at `/media` (not `/api/media`) per the API surface. */
export function mediaFileRoutes(db: Database): Hono {
  const routes = new Hono()

  routes.get('/:id', async (c) => {
    const [row] = await db.select().from(media).where(eq(media.id, c.req.param('id')))
    if (row === undefined) return error(c, 'Media not found', 404)
    let data: Buffer
    try {
      data = await readFile(row.storagePath)
    } catch {
      return error(c, 'File missing from storage', 410)
    }
    return c.body(new Uint8Array(data), 200, {
      'content-type': row.mime,
      'content-length': String(data.byteLength),
      'cache-control': 'private, max-age=86400',
    })
  })

  return routes
}
