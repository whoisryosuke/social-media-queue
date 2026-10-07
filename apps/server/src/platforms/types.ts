import type { Platform, PlatformLimits } from '@social-scheduler/shared'

/** Account with decrypted credentials, as passed to adapters. */
export interface ResolvedAccount {
  id: string
  platform: Platform
  instanceUrl: string | null
  credentials: Record<string, string>
}

/** Profile returned by `verifyCredentials` (stored on the account row). */
export interface AccountProfile {
  remoteId: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

export interface PublishMedia {
  buffer: Uint8Array
  mime: string
  filename: string
  altText?: string | null
}

export interface PublishContent {
  text: string
  media: PublishMedia[]
}

export interface ValidationIssue {
  message: string
}

export type ErrorKind = 'retryable' | 'permanent' | 'auth'

/**
 * Classified platform failure. `auth` means the account must be flagged
 * `needs_reauth`; `retryable` honors `retryAfterMs` when the platform sent
 * `Retry-After`.
 */
export class PlatformError extends Error {
  readonly kind: ErrorKind
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(message: string, kind: ErrorKind, options?: { status?: number; retryAfterMs?: number }) {
    super(message)
    this.name = 'PlatformError'
    this.kind = kind
    this.status = options?.status
    this.retryAfterMs = options?.retryAfterMs
  }
}

export interface PlatformAdapter {
  readonly platform: 'mastodon' | 'bluesky'
  verifyCredentials(account: ResolvedAccount): Promise<AccountProfile>
  getLimits(account: ResolvedAccount): Promise<PlatformLimits>
  validate(content: PublishContent, limits: PlatformLimits): ValidationIssue[]
  publish(
    account: ResolvedAccount,
    content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }>
}
