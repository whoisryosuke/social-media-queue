import {
  BLUESKY_LIMITS,
  blueskyLength,
  DEFAULT_MASTODON_LIMITS,
  mastodonLength,
  type Platform,
  type PlatformLimits,
} from '@social-scheduler/shared'
import { computed } from 'nanostores'
import { $accounts } from './accounts'
import { $composer, type ComposerMedia } from './composer'

export interface PreviewCounter {
  used: number
  limit: number
  over: boolean
}

export interface PreviewModel {
  accountId: string
  platform: Platform
  displayName: string
  handle: string
  avatarUrl?: string
  /** Effective text (override when enabled for this account's platform). */
  text: string
  overridden: boolean
  counter: PreviewCounter
  media: ComposerMedia[]
  scheduledAt: string | null
  issues: string[]
}

function limitsFor(platform: Platform, cached: PlatformLimits | null): PlatformLimits {
  if (cached !== null) return cached
  return platform === 'bluesky' ? BLUESKY_LIMITS : DEFAULT_MASTODON_LIMITS
}

function validateMedia(
  platform: Platform,
  limits: PlatformLimits,
  media: ComposerMedia[],
): string[] {
  const issues: string[] = []
  const images = media.filter((item) => !item.mime.startsWith('video/'))
  const videos = media.filter((item) => item.mime.startsWith('video/'))
  if (media.length > limits.maxImages && platform === 'mastodon') {
    issues.push(`Too many attachments (max ${limits.maxImages})`)
  }
  if (images.length > limits.maxImages) issues.push(`Too many images (max ${limits.maxImages})`)
  if (videos.length > limits.maxVideos) issues.push(`Too many videos (max ${limits.maxVideos})`)
  if (!limits.allowImageVideoMix && images.length > 0 && videos.length > 0) {
    issues.push('Images and video cannot be combined here')
  }
  return issues
}

export const $preview = computed([$composer, $accounts], (composer, accounts) => {
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const models: PreviewModel[] = []
  for (const accountId of composer.accountIds) {
    const account = byId.get(accountId)
    if (account === undefined) continue
    const limits = limitsFor(account.platform, account.limits)
    const overridden =
      composer.overridePlatforms.includes(account.platform) &&
      (composer.overrides[accountId] ?? '').trim() !== ''
    const text = overridden ? composer.overrides[accountId] : composer.body
    const used = account.platform === 'bluesky' ? blueskyLength(text) : mastodonLength(text)
    const issues = validateMedia(account.platform, limits, composer.media)
    models.push({
      accountId,
      platform: account.platform,
      displayName: account.displayName,
      handle: account.handle,
      avatarUrl: account.avatarUrl ?? undefined,
      text,
      overridden,
      counter: { used, limit: limits.maxChars, over: used > limits.maxChars },
      media: composer.media,
      scheduledAt: composer.scheduledAt,
      issues,
    })
  }
  return models
})

/** Tightest character limit among the selected targets (for the editor counter). */
export const $tightestLimit = computed([$composer, $accounts], (composer, accounts) => {
  let limit: number | null = null
  for (const accountId of composer.accountIds) {
    const account = accounts.find((candidate) => candidate.id === accountId)
    if (account === undefined) continue
    const accountLimit = limitsFor(account.platform, account.limits).maxChars
    limit = limit === null ? accountLimit : Math.min(limit, accountLimit)
  }
  return limit
})

/** Whether Schedule/Post-now must be disabled, with reasons. */
export const $composerBlockers = computed([$preview, $composer], (previews, composer) => {
  const blockers: string[] = []
  if (composer.accountIds.length === 0) blockers.push('Select at least one account')
  if (composer.body.trim() === '' && composer.media.length === 0) {
    blockers.push('Write something or attach media')
  }
  if (composer.media.some((item) => item.progress !== null)) blockers.push('Wait for uploads to finish')
  for (const preview of previews) {
    if (preview.counter.over) blockers.push(`${preview.handle} exceeds the character limit`)
    for (const issue of preview.issues) blockers.push(`${preview.handle}: ${issue}`)
  }
  return [...new Set(blockers)]
})
