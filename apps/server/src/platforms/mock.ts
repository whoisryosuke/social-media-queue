import { DEFAULT_MASTODON_LIMITS, BLUESKY_LIMITS, type PlatformLimits } from '@social-scheduler/shared'
import {
  PlatformError,
  type AccountProfile,
  type PlatformAdapter,
  type PublishContent,
  type ResolvedAccount,
  type ValidationIssue,
} from './types.js'

/**
 * Credential-free platform doubles for smoke tests. Enabled with
 * `MOCK_PLATFORMS=true` (never in production). No network calls.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_PLATFORMS === 'true'
}

export class MockPlatformAdapter implements PlatformAdapter {
  readonly platform: 'mastodon' | 'bluesky'

  constructor(platform: 'mastodon' | 'bluesky') {
    this.platform = platform
  }

  async verifyCredentials(account: ResolvedAccount): Promise<AccountProfile> {
    return {
      remoteId: `mock-${account.id}`,
      displayName: 'Mock User',
      handle: account.platform === 'bluesky' ? '@mock.test' : '@mockuser@mock.instance',
      avatarUrl: null,
    }
  }

  async getLimits(account: ResolvedAccount): Promise<PlatformLimits> {
    return account.platform === 'bluesky' ? BLUESKY_LIMITS : DEFAULT_MASTODON_LIMITS
  }

  validate(_content: PublishContent, _limits: PlatformLimits): ValidationIssue[] {
    return []
  }

  async publish(
    _account: ResolvedAccount,
    _content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }> {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return { remoteId: `mock-${ctx.idempotencyKey}`, url: `https://mock.local/posts/${ctx.idempotencyKey}` }
  }
}

export const mockMastodonAccount = {
  id: 'mock-1',
  username: 'mockuser',
  acct: 'mockuser',
  display_name: 'Mock User',
  avatar: '',
}

export function mockAuthorizeUrl(apiOrigin: string, instanceUrl: string): string {
  // Skips the instance approval page: goes straight to our callback.
  return `${apiOrigin}/oauth/mastodon/callback?code=mock-code&state=${encodeURIComponent(instanceUrl)}`
}

export function mockBlueskyProfile(handle: string): {
  did: string
  handle: string
  displayName: string
  avatar: null
} {
  const clean = handle.replace(/^@/, '').toLowerCase()
  return { did: `did:plc:mock-${clean.replace(/[^a-z0-9]/g, '')}`, handle: clean, displayName: 'Mock User', avatar: null }
}

export function assertMockAllowed(): void {
  if (!isMockMode()) throw new PlatformError('Mock mode is not enabled', 'permanent')
}
