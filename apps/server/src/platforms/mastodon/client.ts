import {
  DEFAULT_MASTODON_LIMITS,
  mastodonLength,
  type PlatformLimits,
} from '@social-scheduler/shared'
import { PlatformError, type PublishContent } from '../types.js'

export { PlatformError }

/** Mastodon OAuth scopes used by the app. */
export const MASTODON_SCOPES = 'read write:statuses write:media'

/** How long to wait for async media processing before giving up. */
export const MEDIA_POLL_TIMEOUT_MS = 5 * 60 * 1000
export const MEDIA_POLL_INTERVAL_MS = 3000

interface MastodonAppCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Normalizes user input to an `https://host` origin. Rejects anything that
 * is not plain https (no credentials, no non-default ports tricks — the
 * origin is rebuilt from hostname only).
 */
export function normalizeInstanceUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new PlatformError(`Not a valid instance URL: ${input}`, 'permanent')
  }
  if (url.protocol !== 'https:') throw new PlatformError('Instance URL must use https', 'permanent')
  if (url.username !== '' || url.password !== '') {
    throw new PlatformError('Instance URL must not contain credentials', 'permanent')
  }
  return `https://${url.hostname.toLowerCase()}${url.port === '' ? '' : `:${url.port}`}`
}

export interface MastodonFetchError {
  status: number
  message: string
  retryAfterMs?: number
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return undefined
}

/** Classifies an HTTP failure per the adapter contract. */
export function classifyStatus(status: number, retryAfter: string | null, message: string): PlatformError {
  if (status === 401 || status === 403) {
    return new PlatformError(message, 'auth', { status })
  }
  if (status === 429 || status >= 500) {
    return new PlatformError(message, 'retryable', {
      status,
      retryAfterMs: parseRetryAfter(retryAfter),
    })
  }
  return new PlatformError(message, 'permanent', { status })
}

export async function mastodonFetch(
  instanceUrl: string,
  path: string,
  accessToken: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (accessToken !== null) headers.set('authorization', `Bearer ${accessToken}`)
  let response: Response
  try {
    response = await fetch(`${instanceUrl}${path}`, { ...init, headers })
  } catch (error) {
    throw new PlatformError(
      `Network error reaching ${instanceUrl}: ${(error as Error).message}`,
      'retryable',
    )
  }
  if (!response.ok) {
    let message = `Mastodon request failed: ${response.status}`
    try {
      const data = (await response.json()) as { error?: string; error_description?: string }
      message = data.error_description ?? data.error ?? message
    } catch {
      // Keep the default message when the body is not JSON.
    }
    throw classifyStatus(response.status, response.headers.get('retry-after'), message)
  }
  return response
}

function redirectUri(apiOrigin: string): string {
  return `${apiOrigin}/oauth/mastodon/callback`
}

export async function registerApp(
  instanceUrl: string,
  apiOrigin: string,
): Promise<MastodonAppCredentials> {
  const response = await mastodonFetch(instanceUrl, '/api/v1/apps', null, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Social Scheduler',
      redirect_uris: redirectUri(apiOrigin),
      scopes: MASTODON_SCOPES,
      website: 'https://localhost',
    }),
  })
  const data = (await response.json()) as { client_id?: string; client_secret?: string }
  if (typeof data.client_id !== 'string' || typeof data.client_secret !== 'string') {
    throw new PlatformError('Instance returned an invalid app registration', 'permanent')
  }
  return { clientId: data.client_id, clientSecret: data.client_secret }
}

export function authorizeUrl(
  instanceUrl: string,
  clientId: string,
  apiOrigin: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: MASTODON_SCOPES,
    redirect_uri: redirectUri(apiOrigin),
    response_type: 'code',
    state,
  })
  return `${instanceUrl}/oauth/authorize?${params.toString()}`
}

export async function exchangeCode(
  instanceUrl: string,
  app: MastodonAppCredentials,
  code: string,
  apiOrigin: string,
): Promise<string> {
  const response = await mastodonFetch(instanceUrl, '/oauth/token', null, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: redirectUri(apiOrigin),
      scope: MASTODON_SCOPES,
    }),
  })
  const data = (await response.json()) as { access_token?: string }
  if (typeof data.access_token !== 'string') {
    throw new PlatformError('Instance returned no access token', 'permanent')
  }
  return data.access_token
}

export interface MastodonAccount {
  id: string
  username: string
  acct: string
  display_name: string
  avatar: string
}

export async function verifyCredentials(
  instanceUrl: string,
  accessToken: string,
): Promise<MastodonAccount> {
  const response = await mastodonFetch(
    instanceUrl,
    '/api/v1/accounts/verify_credentials',
    accessToken,
  )
  return (await response.json()) as MastodonAccount
}

interface InstanceV2 {
  configuration?: {
    statuses?: { max_characters?: number; max_media_attachments?: number }
    media_attachments?: {
      supported_mime_types?: string[]
      image_size_limit?: number
      video_size_limit?: number
    }
  }
}

export async function fetchLimits(instanceUrl: string): Promise<PlatformLimits> {
  const response = await mastodonFetch(instanceUrl, '/api/v2/instance', null)
  const data = (await response.json()) as InstanceV2
  const statuses = data.configuration?.statuses
  const attachments = data.configuration?.media_attachments
  return {
    maxChars: statuses?.max_characters ?? DEFAULT_MASTODON_LIMITS.maxChars,
    maxImages: statuses?.max_media_attachments ?? DEFAULT_MASTODON_LIMITS.maxImages,
    maxVideos: statuses?.max_media_attachments ?? DEFAULT_MASTODON_LIMITS.maxVideos,
    maxImageBytes: attachments?.image_size_limit ?? DEFAULT_MASTODON_LIMITS.maxImageBytes,
    maxVideoBytes: attachments?.video_size_limit ?? DEFAULT_MASTODON_LIMITS.maxVideoBytes,
    allowedImageMimes:
      attachments?.supported_mime_types?.filter((mime) => mime.startsWith('image/')) ??
      DEFAULT_MASTODON_LIMITS.allowedImageMimes,
    allowedVideoMimes:
      attachments?.supported_mime_types?.filter((mime) => mime.startsWith('video/')) ??
      DEFAULT_MASTODON_LIMITS.allowedVideoMimes,
    allowImageVideoMix: true,
  }
}

export function validateContent(content: PublishContent, limits: PlatformLimits): { message: string }[] {
  const issues: { message: string }[] = []
  const length = mastodonLength(content.text)
  if (length > limits.maxChars) {
    issues.push({ message: `Text is ${length} characters, limit is ${limits.maxChars}` })
  }
  if (content.media.length > limits.maxImages) {
    issues.push({
      message: `Too many attachments (${content.media.length}, limit is ${limits.maxImages})`,
    })
  }
  for (const item of content.media) {
    const image = item.mime.startsWith('image/')
    const allowed = image ? limits.allowedImageMimes : limits.allowedVideoMimes
    if (!allowed.includes(item.mime)) {
      issues.push({ message: `Unsupported media type: ${item.mime}` })
    }
    const maxBytes = image ? limits.maxImageBytes : limits.maxVideoBytes
    if (item.buffer.byteLength > maxBytes) {
      issues.push({ message: `${item.filename} exceeds the size limit` })
    }
  }
  return issues
}

interface RemoteMedia {
  id: string
  url: string | null
}

export async function uploadMedia(
  instanceUrl: string,
  accessToken: string,
  item: { buffer: Uint8Array; mime: string; filename: string; altText?: string | null },
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const form = new FormData()
  form.append('file', new File([item.buffer as BlobPart], item.filename, { type: item.mime }))
  if (item.altText !== undefined && item.altText !== null && item.altText !== '') {
    form.append('description', item.altText)
  }
  const response = await mastodonFetch(instanceUrl, '/api/v2/media', accessToken, {
    method: 'POST',
    body: form,
  })
  let remote = (await response.json()) as RemoteMedia
  if (remote.url !== null) return remote.id
  // Async processing (202): poll until the url is ready.
  const interval = options.pollIntervalMs ?? MEDIA_POLL_INTERVAL_MS
  const deadline = Date.now() + (options.timeoutMs ?? MEDIA_POLL_TIMEOUT_MS)
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval))
    const poll = await mastodonFetch(instanceUrl, `/api/v1/media/${remote.id}`, accessToken)
    if (poll.status === 206) continue
    remote = (await poll.json()) as RemoteMedia
    if (remote.url !== null) return remote.id
  }
  throw new PlatformError('Timed out waiting for media processing', 'retryable')
}

export async function publishStatus(
  instanceUrl: string,
  accessToken: string,
  text: string,
  mediaIds: string[],
  idempotencyKey: string,
): Promise<{ remoteId: string; url: string }> {
  const form = new FormData()
  form.append('status', text)
  for (const id of mediaIds) form.append('media_ids[]', id)
  const response = await mastodonFetch(instanceUrl, '/api/v1/statuses', accessToken, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form,
  })
  const data = (await response.json()) as { id?: string; url?: string }
  if (typeof data.id !== 'string') throw new PlatformError('Instance returned no status id', 'permanent')
  return { remoteId: data.id, url: data.url ?? '' }
}
