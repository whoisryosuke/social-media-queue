import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from './crypto.js'

const KEY = randomBytes(32).toString('base64')
const OTHER_KEY = randomBytes(32).toString('base64')

describe('credential encryption', () => {
  it('round-trips a credential', () => {
    const envelope = encrypt('mastodon-access-token-123', KEY)
    expect(envelope.startsWith('v1.')).toBe(true)
    expect(decrypt(envelope, KEY)).toBe('mastodon-access-token-123')
  })

  it('produces different envelopes for the same plaintext (random IV)', () => {
    expect(encrypt('same', KEY)).not.toBe(encrypt('same', KEY))
  })

  it('detects tampering', () => {
    const envelope = encrypt('secret', KEY)
    const tampered = `${envelope.slice(0, -2)}AB`
    expect(() => decrypt(tampered, KEY)).toThrow()
  })

  it('rejects the wrong key', () => {
    const envelope = encrypt('secret', KEY)
    expect(() => decrypt(envelope, OTHER_KEY)).toThrow()
  })

  it('rejects malformed envelopes and bad keys', () => {
    expect(() => decrypt('not-an-envelope', KEY)).toThrow()
    expect(() => decrypt('v1.!!!!', KEY)).toThrow()
    expect(() => encrypt('x', 'short')).toThrow()
  })
})
