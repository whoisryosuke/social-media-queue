import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const mockState = vi.hoisted(() => ({
  loginError: null as { status: number; message: string } | null,
  session: { did: 'did:plc:test', handle: 'alice.test' },
  profile: { did: 'did:plc:test', handle: 'alice.test', displayName: 'Alice', avatar: 'https://cdn/ava' },
  uploadLimits: { canUpload: true as boolean, message: undefined as string | undefined },
  putRecords: [] as { rkey: string; record: unknown }[],
  blobs: 0,
}))

vi.mock('@atproto/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@atproto/api')>()
  class MockBskyAgent {
    service: URL
    session: { did: string; handle: string } | undefined
    constructor(options: { service: string }) {
      this.service = new URL(options.service)
    }
    async login(): Promise<void> {
      if (mockState.loginError !== null) {
        const error = new Error(mockState.loginError.message) as Error & { status: number }
        error.status = mockState.loginError.status
        throw error
      }
      this.session = mockState.session
    }
    async getProfile(): Promise<{ data: typeof mockState.profile }> {
      return { data: mockState.profile }
    }
    async uploadBlob(buffer: Uint8Array, options: { encoding: string }): Promise<unknown> {
      mockState.blobs += 1
      return { data: { blob: { ref: `blob-${mockState.blobs}`, mimeType: options.encoding, size: buffer.byteLength } } }
    }
    app = {
      bsky: {
        video: {
          getUploadLimits: async (): Promise<unknown> => ({ data: mockState.uploadLimits }),
        },
      },
    }
    com = {
      atproto: {
        server: {
          getServiceAuth: async (): Promise<unknown> => ({ data: { token: 'service-token' } }),
        },
        repo: {
          putRecord: async (input: { rkey: string; record: unknown }): Promise<unknown> => {
            mockState.putRecords.push({ rkey: input.rkey, record: input.record })
            return { data: { uri: `at://did:plc:test/app.bsky.feed.post/${input.rkey}`, cid: 'cid' } }
          },
        },
      },
    }
  }
  return { ...actual, BskyAgent: MockBskyAgent }
})

import { BLUESKY_LIMITS } from '@social-scheduler/shared'
import { BlueskyAdapter, decodeCredentials } from './adapter.js'
import {
  connect,
  normalizeHandle,
  prepareImage,
  publishRecord,
  uploadVideo,
  validateContent,
} from './client.js'
import { PlatformError } from '../types.js'

beforeEach(() => {
  mockState.loginError = null
  mockState.uploadLimits = { canUpload: true, message: undefined }
  mockState.putRecords = []
  mockState.blobs = 0
})

describe('normalizeHandle', () => {
  it('strips @ and lowercases', () => {
    expect(normalizeHandle('@Alice.Test')).toBe('alice.test')
  })

  it('rejects blanks and paths', () => {
    expect(() => normalizeHandle('  ')).toThrow()
    expect(() => normalizeHandle('a/b')).toThrow()
  })
})

describe('decodeCredentials', () => {
  it('rejects missing secrets as auth errors', () => {
    expect(() => decodeCredentials({ handle: 'a' })).toThrowError(PlatformError)
    expect(() => decodeCredentials({ handle: 'a', appPassword: '' })).toThrowError(PlatformError)
    expect(decodeCredentials({ handle: 'a', appPassword: 'x' }).appPassword).toBe('x')
  })
})

describe('connect', () => {
  it('logs in and returns the session', async () => {
    const agent = await connect({ handle: 'alice.test', appPassword: 'xxxx-xxxx' })
    expect(agent.session?.did).toBe('did:plc:test')
  })

  it('maps login failures to auth errors', async () => {
    mockState.loginError = { status: 401, message: 'Authentication Required' }
    await expect(connect({ handle: 'alice.test', appPassword: 'bad' })).rejects.toMatchObject({
      kind: 'auth',
    })
  })
})

describe('validateContent', () => {
  it('enforces the 300-grapheme limit', () => {
    const issues = validateContent({ text: 'x'.repeat(301), media: [] }, BLUESKY_LIMITS)
    expect(issues).toHaveLength(1)
  })

  it('rejects image+video mixes and too many images', () => {
    const image = { buffer: new Uint8Array([1]), mime: 'image/png', filename: 'a.png' }
    const video = { buffer: new Uint8Array([1]), mime: 'video/mp4', filename: 'v.mp4' }
    expect(
      validateContent({ text: 'hi', media: [image, video] }, BLUESKY_LIMITS),
    ).toHaveLength(1)
    expect(
      validateContent(
        { text: 'hi', media: [image, image, image, image, image] },
        BLUESKY_LIMITS,
      ),
    ).toHaveLength(1)
    expect(validateContent({ text: 'hi', media: [image, image] }, BLUESKY_LIMITS)).toEqual([])
  })

  it('rejects unsupported types', () => {
    const gif = { buffer: new Uint8Array([1]), mime: 'image/gif', filename: 'a.gif' }
    expect(validateContent({ text: 'hi', media: [gif] }, BLUESKY_LIMITS)).toHaveLength(1)
  })
})

describe('prepareImage', () => {
  it('passes small images through untouched', async () => {
    const png = new Uint8Array(
      await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .png()
        .toBuffer(),
    )
    const prepared = await prepareImage(png, 'image/png')
    expect(prepared.mime).toBe('image/png')
    expect(prepared.buffer).toEqual(png)
    expect(prepared.width).toBe(4)
  })

  it('compresses oversized images under the limit', async () => {
    const big = new Uint8Array(
      await sharp({
        create: { width: 3000, height: 3000, channels: 3, background: { r: 200, g: 100, b: 50 } },
      })
        .png()
        .toBuffer(),
    )
    expect(big.byteLength).toBeGreaterThan(100_000)
    const prepared = await prepareImage(big, 'image/png', 100_000)
    expect(prepared.mime).toBe('image/jpeg')
    expect(prepared.buffer.byteLength).toBeLessThanOrEqual(100_000)
  })
})

describe('uploadVideo', () => {
  function stubVideoService(scenario: 'ready' | 'poll-then-ready'): void {
    let polls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('uploadVideo')) {
          return new Response(
            JSON.stringify({ jobStatus: { jobId: 'job1', did: 'did:plc:test', state: 'JOB_STATE_CREATED' } }),
          )
        }
        polls += 1
        if (scenario === 'ready' || polls >= 2) {
          return new Response(
            JSON.stringify({
              jobStatus: {
                jobId: 'job1',
                did: 'did:plc:test',
                state: 'JOB_STATE_COMPLETED',
                blob: { ref: 'videoblob' },
              },
            }),
          )
        }
        return new Response(
          JSON.stringify({ jobStatus: { jobId: 'job1', did: 'did:plc:test', state: 'JOB_STATE_CREATED' } }),
        )
      }),
    )
  }

  it('uploads and polls until the blob is ready', async () => {
    stubVideoService('poll-then-ready')
    const agent = await connect({ handle: 'alice.test', appPassword: 'x' })
    const result = await uploadVideo(
      agent,
      { buffer: new Uint8Array([1, 2, 3]), mime: 'video/mp4', filename: 'v.mp4' },
      { pollIntervalMs: 5 },
    )
    expect(result.blob).toMatchObject({ ref: 'videoblob' })
    vi.unstubAllGlobals()
  })

  it('refuses when the service disallows uploads', async () => {
    mockState.uploadLimits = { canUpload: false, message: 'daily limit reached' }
    const agent = await connect({ handle: 'alice.test', appPassword: 'x' })
    await expect(
      uploadVideo(agent, { buffer: new Uint8Array([1]), mime: 'video/mp4', filename: 'v.mp4' }),
    ).rejects.toMatchObject({ kind: 'permanent' })
  })
})

describe('publishRecord', () => {
  it('uses putRecord with the deterministic rkey', async () => {
    const agent = await connect({ handle: 'alice.test', appPassword: 'x' })
    const result = await publishRecord(
      agent,
      { text: 'hello', createdAt: new Date().toISOString() },
      'target-uuid-1',
    )
    expect(mockState.putRecords).toHaveLength(1)
    expect(mockState.putRecords[0].rkey).toBe('target-uuid-1')
    expect(result.remoteId).toContain('target-uuid-1')
    expect(result.url).toBe('https://bsky.app/profile/alice.test/post/target-uuid-1')
  })
})

describe('BlueskyAdapter', () => {
  const account = { id: 'a1', platform: 'bluesky' as const, instanceUrl: null, credentials: {} }

  it('verifies credentials into a profile', async () => {
    const adapter = new BlueskyAdapter()
    const profile = await adapter.verifyCredentials({
      ...account,
      credentials: { handle: 'alice.test', appPassword: 'x' },
    })
    expect(profile).toMatchObject({ handle: '@alice.test', displayName: 'Alice' })
  })

  it('returns the constant limits', async () => {
    const adapter = new BlueskyAdapter()
    await expect(adapter.getLimits(account)).resolves.toBe(BLUESKY_LIMITS)
  })
})
