// Generates a 32-byte base64 encryption key for ENCRYPTION_KEY.
// Usage: pnpm gen:key
import { randomBytes } from 'node:crypto'

console.log(randomBytes(32).toString('base64'))
