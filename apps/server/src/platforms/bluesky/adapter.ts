import { BLUESKY_LIMITS, type PlatformLimits } from '@social-scheduler/shared'
import {
  PlatformError,
  type AccountProfile,
  type PlatformAdapter,
  type PublishContent,
  type ResolvedAccount,
  type ValidationIssue,
} from '../types.js'
import {
  connect,
  detectFacets,
  normalizeHandle,
  publishRecord,
  uploadImages,
  uploadVideo,
  validateContent,
  type BlueskyCredentials,
} from './client.js'

export function decodeCredentials(credentials: Record<string, string>): BlueskyCredentials {
  const { handle, appPassword, service } = credentials
  if (typeof handle !== 'string' || handle === '') {
    throw new PlatformError('Bluesky account is missing its handle', 'auth')
  }
  if (typeof appPassword !== 'string' || appPassword === '') {
    throw new PlatformError('Bluesky account is missing its app password', 'auth')
  }
  return {
    handle,
    appPassword,
    ...(typeof service === 'string' && service !== '' ? { service } : {}),
  }
}

export class BlueskyAdapter implements PlatformAdapter {
  readonly platform = 'bluesky' as const

  async verifyCredentials(account: ResolvedAccount): Promise<AccountProfile> {
    const credentials = decodeCredentials(account.credentials)
    const agent = await connect(credentials)
    const profile = await agent.getProfile({ actor: agent.session?.did ?? credentials.handle })
    return {
      remoteId: profile.data.did,
      displayName: profile.data.displayName ?? profile.data.handle,
      handle: `@${profile.data.handle}`,
      avatarUrl: profile.data.avatar ?? null,
    }
  }

  async getLimits(_account: ResolvedAccount): Promise<PlatformLimits> {
    return BLUESKY_LIMITS
  }

  validate(content: PublishContent, limits: PlatformLimits): ValidationIssue[] {
    return validateContent(content, limits)
  }

  /**
   * Publishes via `putRecord`. `ctx.idempotencyKey` MUST be a TID
   * (generate once per target with `nextRkey()` and reuse across retries —
   * the worker stores it on the target row). Retries overwrite instead of
   * duplicating.
   */
  async publish(
    account: ResolvedAccount,
    content: PublishContent,
    ctx: { idempotencyKey: string },
  ): Promise<{ remoteId: string; url: string }> {    const agent = await connect(decodeCredentials(account.credentials))
    const richText = await detectFacets(agent, content.text)

    const images = content.media.filter((item) => item.mime.startsWith('image/'))
    const videos = content.media.filter((item) => !item.mime.startsWith('image/'))
    let embed:
      | { $type: 'app.bsky.embed.images'; images: { image: unknown; alt: string }[] }
      | { $type: 'app.bsky.embed.video'; video: unknown; alt?: string }
      | undefined
    if (images.length > 0) {
      const uploaded = await uploadImages(agent, images)
      embed = { $type: 'app.bsky.embed.images', images: uploaded.images }
    } else if (videos.length > 0) {
      const [first] = videos
      const uploaded = await uploadVideo(agent, {
        buffer: first.buffer,
        mime: first.mime,
        filename: first.filename,
      })
      embed = { $type: 'app.bsky.embed.video', video: uploaded.blob, alt: first.altText ?? '' }
    }

    return publishRecord(
      agent,
      {
        text: richText.text,
        facets: richText.facets,
        ...(embed === undefined ? {} : { embed }),
        createdAt: new Date().toISOString(),
      },
      ctx.idempotencyKey,
    )
  }
}

export { normalizeHandle }
