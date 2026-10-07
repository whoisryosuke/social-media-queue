import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const IV_BYTES = 12
const KEY_BYTES = 32
const ENVELOPE_VERSION = 'v1'

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes`)
  }
  return key
}

/**
 * Encrypts a credential string with AES-256-GCM. Output envelope:
 * `v1.<base64 iv+ciphertext+tag>`. Never log inputs or outputs.
 */
export function encrypt(plaintext: string, keyBase64: string): string {
  const key = parseKey(keyBase64)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENVELOPE_VERSION}.${Buffer.concat([iv, ciphertext, tag]).toString('base64')}`
}

/** Decrypts an envelope from {@link encrypt}. Throws on tampering or wrong key. */
export function decrypt(envelope: string, keyBase64: string): string {
  const key = parseKey(keyBase64)
  const prefix = `${ENVELOPE_VERSION}.`
  if (!envelope.startsWith(prefix)) throw new Error('Unsupported credential envelope')
  const raw = Buffer.from(envelope.slice(prefix.length), 'base64')
  if (raw.length < IV_BYTES + 16 + 1) throw new Error('Malformed credential envelope')
  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(raw.length - 16)
  const ciphertext = raw.subarray(IV_BYTES, raw.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
