import type { PlatformLimits } from '@social-scheduler/shared'
import {
  PlatformError,
  type AccountProfile,
  type PlatformAdapter,
  type PublishContent,
  type ResolvedAccount,
  type ValidationIssue,
} from '../types.js'
import {
  fetchLimits,
  publishStatus,
  uploadMedia,
  validateContent,
  verifyCredentials,
} from './client.js'

export interface MastodonCredentials {
  accessToken: string
}

export function decodeCredentials(credentials: Record<string, string>): MastodonCredentials {
  const accessToken = credentials.accessToken
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new PlatformError('Mastodon account is missing its access token', 'auth')
  }
  return { accessToken }
}

function instanceOf(account: ResolvedAccount): string {
  if (account.instanceUrl === null || account.instanceUrl === '') {
    throw new PlatformError('Mastodon account is missing its instance URL', 'permanent')
  }
  return account.instanceUrl
}

export class MastodonAdapter implements PlatformAdapter {
  readonly platform = 'mastodon' as const

  async verifyCredentials(account: ResolvedAccount): Promise<AccountProfile> {
    const { accessToken } = decodeCredentials(account.credentials)
    const remote = await verifyCredentials(instanceOf(account), accessToken)
    const host = new URL(instanceOf(account)).hostname
    return {
      remoteId: remote.id,
      displayName: remote.display_name || remote.username,
      handle: remote.acct.includes('@') ? `@${remote.acct}` : `@${remote.acct}@${host}`,
      avatarUrl: remote.avatar || null,
    }
  }

  async getLimits(account: ResolvedAccount): Promise<PlatformLimits> {
    return fetchLimits(instanceOf(account))
  }

  validate(content: PublishContent, limits: PlatformLimits): ValidationIssue[] {
    return validateContent(content, limits)
  }

  async publish(
    account: ResolvedAccount,
    content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }> {
    const { accessToken } = decodeCredentials(account.credentials)
    const instanceUrl = instanceOf(account)
    const mediaIds: string[] = []
    for (const item of content.media) {
      mediaIds.push(await uploadMedia(instanceUrl, accessToken, item))
    }
    return publishStatus(instanceUrl, accessToken, content.text, mediaIds, ctx.idempotencyKey)
  }
}
