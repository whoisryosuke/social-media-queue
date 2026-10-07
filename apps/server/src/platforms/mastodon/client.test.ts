import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authorizeUrl,
  classifyStatus,
  exchangeCode,
  fetchLimits,
  normalizeInstanceUrl,
  publishStatus,
  registerApp,
  uploadMedia,
  validateContent,
  verifyCredentials,
} from './client.js'

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => handler(url, init)))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeInstanceUrl', () => {
  it('normalizes bare hosts, casing, paths and ports', () => {
    expect(normalizeInstanceUrl('mastodon.social')).toBe('https://mastodon.social')
    expect(normalizeInstanceUrl('https://Mastodon.Social/users/x')).toBe('https://mastodon.social')
    expect(normalizeInstanceUrl('localhost:3000')).toBe('https://localhost:3000')
  })

  it('rejects http, credentials and garbage', () => {
    expect(() => normalizeInstanceUrl('http://localhost:3000')).toThrow()
    expect(() => normalizeInstanceUrl('http://insecure.example')).toThrow()
    expect(() => normalizeInstanceUrl('https://user:pass@host.example')).toThrow()
    expect(() => normalizeInstanceUrl('not a url at all !!!')).toThrow()
  })
})

describe('OAuth connect flow', () => {
  it('registers an app with the right scopes and redirect', async () => {
    let seenBody: Record<string, unknown> = {}
    stubFetch(async (url, init) => {
      expect(url).toBe('https://mastodon.social/api/v1/apps')
      seenBody = JSON.parse(init.body as string) as Record<string, unknown>
      return jsonResponse({ client_id: 'cid', client_secret: 'csec' })
    })
    const app = await registerApp('https://mastodon.social', 'http://localhost:4000')
    expect(app).toEqual({ clientId: 'cid', clientSecret: 'csec' })
    expect(seenBody['scopes']).toBe('read write:statuses write:media')
    expect(seenBody['redirect_uris']).toBe('http://localhost:4000/oauth/mastodon/callback')
  })

  it('builds the authorize URL and exchanges the code', async () => {
    const url = authorizeUrl('https://mastodon.social', 'cid', 'http://localhost:4000')
    expect(url).toContain('https://mastodon.social/oauth/authorize?')
    expect(url).toContain('response_type=code')

    stubFetch(async (url, init) => {
      expect(url).toBe('https://mastodon.social/oauth/token')
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['grant_type']).toBe('authorization_code')
      expect(body['code']).toBe('authcode')
      return jsonResponse({ access_token: 'token123' })
    })
    await expect(
      exchangeCode(
        'https://mastodon.social',
        { clientId: 'cid', clientSecret: 'csec' },
        'authcode',
        'http://localhost:4000',
      ),
    ).resolves.toBe('token123')
  })

  it('verifies credentials', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('https://mastodon.social/api/v1/accounts/verify_credentials')
      expect((init.headers as Headers).get('authorization')).toBe('Bearer token123')
      return jsonResponse({
        id: '42',
        username: 'alice',
        acct: 'alice',
        display_name: 'Alice',
        avatar: 'https://cdn/ava.png',
      })
    })
    const account = await verifyCredentials('https://mastodon.social', 'token123')
    expect(account.username).toBe('alice')
  })
})

describe('limits', () => {
  it('maps /api/v2/instance configuration', async () => {
    stubFetch(async () =>
      jsonResponse({
        configuration: {
          statuses: { max_characters: 1000, max_media_attachments: 2 },
          media_attachments: {
            supported_mime_types: ['image/jpeg', 'video/mp4'],
            image_size_limit: 1_000_000,
            video_size_limit: 2_000_000,
          },
        },
      }),
    )
    const limits = await fetchLimits('https://mastodon.social')
    expect(limits.maxChars).toBe(1000)
    expect(limits.maxImages).toBe(2)
    expect(limits.maxImageBytes).toBe(1_000_000)
    expect(limits.allowedImageMimes).toEqual(['image/jpeg'])
    expect(limits.allowImageVideoMix).toBe(true)
  })
})

describe('media upload', () => {
  it('returns the id when processed synchronously', async () => {
    stubFetch(async () => jsonResponse({ id: 'm1', url: 'https://cdn/m1.jpg' }))
    const id = await uploadMedia('https://mastodon.social', 'tok', {
      buffer: new Uint8Array([1, 2, 3]),
      mime: 'image/png',
      filename: 'a.png',
      altText: 'alt',
    })
    expect(id).toBe('m1')
  })

  it('polls after a 202 until the url is ready', async () => {
    let calls = 0
    stubFetch(async (url) => {
      calls += 1
      if (url.endsWith('/api/v2/media')) return jsonResponse({ id: 'm9', url: null }, 202)
      if (calls === 2) return new Response(null, { status: 206 })
      return jsonResponse({ id: 'm9', url: 'https://cdn/m9.mp4' })
    })
    const id = await uploadMedia(
      'https://mastodon.social',
      'tok',
      {
        buffer: new Uint8Array([1]),
        mime: 'video/mp4',
        filename: 'v.mp4',
      },
      { pollIntervalMs: 5 },
    )
    expect(id).toBe('m9')
    expect(calls).toBe(3)
  }, 10_000)
})

describe('publishStatus', () => {
  it('sends the idempotency key and media ids', async () => {
    let seenHeaders: Headers | null = null
    stubFetch(async (url, init) => {
      expect(url).toBe('https://mastodon.social/api/v1/statuses')
      seenHeaders = init.headers as Headers
      expect(init.body).toBeInstanceOf(FormData)
      return jsonResponse({ id: 's1', url: 'https://mastodon.social/@a/1' })
    })
    const result = await publishStatus('https://mastodon.social', 'tok', 'hello', ['m1'], 'target-1')
    expect(result).toEqual({ remoteId: 's1', url: 'https://mastodon.social/@a/1' })
    expect(seenHeaders?.get('Idempotency-Key')).toBe('target-1')
  })
})

describe('error classification', () => {
  it('marks 429/5xx retryable, 401/403 auth, 422 permanent', () => {
    expect(classifyStatus(429, '120', 'slow').kind).toBe('retryable')
    expect(classifyStatus(429, '120', 'slow').retryAfterMs).toBe(120_000)
    expect(classifyStatus(503, null, 'down').kind).toBe('retryable')
    expect(classifyStatus(401, null, 'bad').kind).toBe('auth')
    expect(classifyStatus(403, null, 'bad').kind).toBe('auth')
    expect(classifyStatus(422, null, 'invalid').kind).toBe('permanent')
  })

  it('treats network failures as retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up')
      }),
    )
    await expect(verifyCredentials('https://mastodon.social', 'tok')).rejects.toMatchObject({
      kind: 'retryable',
    })
  })
})

describe('validateContent', () => {
  const limits = {
    maxChars: 10,
    maxImages: 1,
    maxVideos: 1,
    maxImageBytes: 100,
    maxVideoBytes: 100,
    allowedImageMimes: ['image/png'],
    allowedVideoMimes: ['video/mp4'],
    allowImageVideoMix: true,
  }

  it('flags overlong text, too many attachments, bad types and oversize files', () => {
    const issues = validateContent(
      {
        text: 'this text is far too long',
        media: [
          { buffer: new Uint8Array(200), mime: 'image/png', filename: 'big.png' },
          { buffer: new Uint8Array(10), mime: 'image/gif', filename: 'a.gif' },
        ],
      },
      limits,
    )
    expect(issues.length).toBeGreaterThanOrEqual(3)
  })

  it('passes valid content', () => {
    expect(
      validateContent(
        { text: 'short', media: [{ buffer: new Uint8Array(10), mime: 'image/png', filename: 'a.png' }] },
        limits,
      ),
    ).toEqual([])
  })
})
