import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
}

const VIDEO_MIMES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
}

export type MediaKind = 'image' | 'video'

export function classifyMime(mime: string): { kind: MediaKind; extension: string } | null {
  const image = IMAGE_MIMES[mime]
  if (image !== undefined) return { kind: 'image', extension: image }
  const video = VIDEO_MIMES[mime]
  if (video !== undefined) return { kind: 'video', extension: video }
  return null
}

/**
 * Minimal magic-byte sniffing for accepted video containers
 * (mp4 = `ftyp` box near the start, webm = EBML header).
 */
export function sniffVideo(buffer: Uint8Array, mime: string): boolean {
  if (mime === 'video/webm') {
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  }
  if (mime === 'video/mp4') {
    const head = Buffer.from(buffer.subarray(0, 12)).toString('ascii')
    return head.includes('ftyp')
  }
  return false
}

/** Resolves the on-disk path for a media id. Never uses client filenames. */
export function storagePathFor(storageDir: string, id: string, extension: string): string {
  return path.join(path.resolve(storageDir), `${id}${extension}`)
}

export async function storeBuffer(storagePath: string, buffer: Uint8Array): Promise<void> {
  await mkdir(path.dirname(storagePath), { recursive: true })
  await writeFile(storagePath, buffer)
}

export async function removeFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
