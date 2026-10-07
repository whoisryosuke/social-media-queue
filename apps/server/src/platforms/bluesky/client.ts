import { BskyAgent, RichText } from '@atproto/api'
import { TID } from '@atproto/common-web'
import { BLUESKY_LIMITS, blueskyLength, type PlatformLimits } from '@social-scheduler/shared'
import sharp from 'sharp'
import { PlatformError, type PublishContent } from '../types.js'

export const DEFAULT_PDS = 'https://bsky.social'
export const VIDEO_SERVICE_URL = 'https://video.bsky.app'
export const VIDEO_POLL_INTERVAL_MS = 2000
export const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000

export interface BlueskyCredentials {
  handle: string
  appPassword: string
  service?: string
}

/** Strips `@`, lowercases — the handle form the PDS expects. */
export function normalizeHandle(input: string): string {
  const handle = input.trim().replace(/^@/, '').toLowerCase()
  if (handle === '' || handle.includes(' ') || handle.includes('/')) {
    throw new PlatformError(`Not a valid Bluesky handle: ${input}`, 'permanent')
  }
  return handle
}

/** Generates a fresh record key (TID). `app.bsky.feed.post` only accepts TIDs. */
export function nextRkey(): string {
  return TID.nextStr()
}

function toPlatformError(error: unknown, context: string): PlatformError {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof TypeError) return new PlatformError(`${context}: ${message}`, 'retryable')
  if (status === 401 || status === 403) return new PlatformError(`${context}: ${message}`, 'auth', { status })
  if (status === 429 || (status !== undefined && status >= 500)) {
    return new PlatformError(`${context}: ${message}`, 'retryable', { status })
  }
  return new PlatformError(`${context}: ${message}`, 'permanent', { status })
}

/** Logs in with handle + app password. A fresh session per publish avoids expiry handling. */
export async function connect(credentials: BlueskyCredentials): Promise<BskyAgent> {
  const agent = new BskyAgent({ service: credentials.service ?? DEFAULT_PDS })
  try {
    await agent.login({ identifier: credentials.handle, password: credentials.appPassword })
  } catch (error) {
    throw toPlatformError(error, 'Bluesky login failed')
  }
  if (agent.session === undefined) throw new PlatformError('Bluesky login returned no session', 'auth')
  return agent
}

export interface PreparedImage {
  buffer: Uint8Array
  mime: string
  width?: number
  height?: number
}

/**
 * Ensures an image fits the blob size limit. Buffers already under the limit
 * (and of an allowed type) are uploaded untouched — originals are never
 * modified; compression happens on in-memory copies only.
 */
export async function prepareImage(
  buffer: Uint8Array,
  mime: string,
  maxBytes: number = BLUESKY_LIMITS.maxImageBytes,
): Promise<PreparedImage> {
  const metadata = await sharp(buffer).metadata().catch(() => null)
  if (buffer.byteLength <= maxBytes && BLUESKY_LIMITS.allowedImageMimes.includes(mime)) {
    return { buffer, mime, width: metadata?.width, height: metadata?.height }
  }
  // Large GIFs would lose animation when re-encoded; oversized originals are
  // still preferable to rejection, so this is a documented v1 trade-off.
  const steps: { size: number; quality: number }[] = [
    { size: 2048, quality: 85 },
    { size: 2048, quality: 75 },
    { size: 1600, quality: 75 },
    { size: 1600, quality: 60 },
    { size: 1200, quality: 60 },
    { size: 800, quality: 50 },
  ]
  for (const step of steps) {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: step.size, height: step.size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: step.quality })
      .toBuffer()
    if (out.byteLength <= maxBytes) {
      const outMeta = await sharp(out).metadata().catch(() => null)
      return { buffer: new Uint8Array(out), mime: 'image/jpeg', width: outMeta?.width, height: outMeta?.height }
    }
  }
  throw new PlatformError('Image cannot be compressed under the Bluesky size limit', 'permanent')
}

export function validateContent(content: PublishContent, limits: PlatformLimits): { message: string }[] {
  const issues: { message: string }[] = []
  const length = blueskyLength(content.text)
  if (length > limits.maxChars) {
    issues.push({ message: `Text is ${length} graphemes, limit is ${limits.maxChars}` })
  }
  const images = content.media.filter((item) => item.mime.startsWith('image/'))
  const videos = content.media.filter((item) => !item.mime.startsWith('image/'))
  if (images.length > limits.maxImages) {
    issues.push({ message: `Too many images (${images.length}, limit is ${limits.maxImages})` })
  }
  if (videos.length > limits.maxVideos) {
    issues.push({ message: `Too many videos (${videos.length}, limit is ${limits.maxVideos})` })
  }
  if (!limits.allowImageVideoMix && images.length > 0 && videos.length > 0) {
    issues.push({ message: 'Images and video cannot be combined in one Bluesky post' })
  }
  for (const item of content.media) {
    const image = item.mime.startsWith('image/')
    const allowed = image ? limits.allowedImageMimes : limits.allowedVideoMimes
    if (!allowed.includes(item.mime)) issues.push({ message: `Unsupported media type: ${item.mime}` })
  }
  return issues
}

export async function detectFacets(agent: BskyAgent, text: string): Promise<RichText> {
  const richText = new RichText({ text })
  try {
    await richText.detectFacets(agent)
  } catch (error) {
    throw toPlatformError(error, 'Bluesky facet detection failed')
  }
  return richText
}

type BlobRef = Awaited<ReturnType<BskyAgent['uploadBlob']>>['data']['blob']

export async function uploadImages(
  agent: BskyAgent,
  items: { buffer: Uint8Array; mime: string; altText?: string | null }[],
): Promise<{ images: { image: BlobRef; alt: string; aspectRatio?: { width: number; height: number } }[] }> {
  const images: { image: BlobRef; alt: string; aspectRatio?: { width: number; height: number } }[] = []
  for (const item of items) {
    const prepared = await prepareImage(item.buffer, item.mime)
    let response
    try {
      response = await agent.uploadBlob(prepared.buffer, { encoding: prepared.mime })
    } catch (error) {
      throw toPlatformError(error, 'Bluesky image upload failed')
    }
    images.push({
      image: response.data.blob,
      alt: item.altText ?? '',
      ...(prepared.width !== undefined && prepared.height !== undefined
        ? { aspectRatio: { width: prepared.width, height: prepared.height } }
        : {}),
    })
  }
  return { images }
}

interface VideoJobStatus {
  jobStatus: {
    jobId: string
    did: string
    state: string
    blob?: BlobRef
    message?: string
  }
}

/** Mints a service-auth token for one video-service method call. */
async function videoServiceToken(agent: BskyAgent, lxm: string): Promise<string> {
  try {
    const response = await agent.com.atproto.server.getServiceAuth({
      aud: 'did:web:video.bsky.app',
      lxm,
      exp: Math.floor(Date.now() / 1000) + 60 * 30,
    })
    return (response.data as { token: string }).token
  } catch (error) {
    throw toPlatformError(error, 'Bluesky video service auth failed')
  }
}

function videoErrorMessage(data: { error?: string; message?: string }): string {
  return data.message ?? data.error ?? 'Video processing failed'
}

async function videoServiceGet<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${VIDEO_SERVICE_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch (error) {
    throw toPlatformError(error, 'Bluesky video service request failed')
  }
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      blob?: BlobRef
      error?: string
      message?: string
    } | null
    // `already_exists`: the video was processed before — reuse its blob.
    if (failure?.blob !== undefined) return failure as T
    throw toPlatformError(
      { status: response.status, message: videoErrorMessage(failure ?? {}) },
      'Bluesky video service request failed',
    )
  }
  return (await response.json()) as T
}

export async function uploadVideo(
  agent: BskyAgent,
  item: { buffer: Uint8Array; mime: string; filename: string },
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<{ blob: BlobRef }> {
  const interval = options.pollIntervalMs ?? VIDEO_POLL_INTERVAL_MS
  const timeout = options.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS

  // NOTE: the PDS does not implement these methods (501), so everything goes
  // straight to the video service with per-method service-auth tokens
  // (aud `did:web:video.bsky.app`, lxm = the method NSID).
  let limits: { canUpload: boolean; message?: string }
  try {
    const token = await videoServiceToken(agent, 'app.bsky.video.getUploadLimits')
    limits = await videoServiceGet<{ canUpload: boolean; message?: string }>(
      '/xrpc/app.bsky.video.getUploadLimits',
      token,
    )
  } catch (error) {
    throw toPlatformError(error, 'Bluesky video limits check failed')
  }
  if (!limits.canUpload) {
    throw new PlatformError(`Video upload not allowed: ${limits.message ?? 'unknown reason'}`, 'permanent')
  }

  const did = agent.session?.did
  if (did === undefined) throw new PlatformError('Bluesky session expired', 'auth')
  const uploadToken = await videoServiceToken(agent, 'app.bsky.video.uploadVideo')
  const uploadUrl = new URL(`${VIDEO_SERVICE_URL}/xrpc/app.bsky.video.uploadVideo`)
  uploadUrl.searchParams.set('did', did)
  uploadUrl.searchParams.set('name', item.filename)
  let job: VideoJobStatus['jobStatus']
  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${uploadToken}`, 'content-type': item.mime },
      body: item.buffer as BodyInit,
    })
    if (!response.ok) throw new Error(`upload failed: ${response.status}`)
    job = ((await response.json()) as VideoJobStatus).jobStatus
  } catch (error) {
    throw toPlatformError(error, 'Bluesky video upload failed')
  }
  if (job.blob !== undefined) return { blob: job.blob }

  const statusToken = await videoServiceToken(agent, 'app.bsky.video.getJobStatus')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval))
    let status: VideoJobStatus['jobStatus']
    try {
      status = (
        await videoServiceGet<VideoJobStatus>(
          `/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(job.jobId)}`,
          statusToken,
        )
      ).jobStatus
    } catch (error) {
      throw toPlatformError(error, 'Bluesky video job polling failed')
    }
    if (status.blob !== undefined) return { blob: status.blob }
    if (status.state === 'JOB_STATE_FAILED') {
      throw new PlatformError(`Video processing failed: ${status.message ?? 'unknown'}`, 'permanent')
    }
  }
  throw new PlatformError('Timed out waiting for video processing', 'retryable')
}

export interface BlueskyEmbed {
  $type: string
  [key: string]: unknown
}

export async function publishRecord(
  agent: BskyAgent,
  record: {
    text: string
    facets?: unknown[]
    embed?: BlueskyEmbed
    createdAt: string
  },
  rkey: string,
): Promise<{ remoteId: string; url: string }> {
  const did = agent.session?.did
  if (did === undefined) throw new PlatformError('Bluesky session expired', 'auth')
  let uri: string
  try {
    // putRecord (not createRecord): retries with the same deterministic rkey
    // overwrite instead of duplicating the post.
    const response = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: 'app.bsky.feed.post',
      rkey,
      record: {
        $type: 'app.bsky.feed.post',
        ...record,
      },
    })
    uri = (response.data as { uri: string }).uri
  } catch (error) {
    throw toPlatformError(error, 'Bluesky publish failed')
  }
  const handle = agent.session?.handle ?? did
  const shortRkey = uri.split('/').pop() ?? rkey
  return { remoteId: uri, url: `https://bsky.app/profile/${handle}/post/${shortRkey}` }
}
