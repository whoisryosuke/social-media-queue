import { BLUESKY_LIMITS } from '@social-scheduler/shared'
import type { Account } from '@social-scheduler/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { $accounts } from './accounts'
import { $composer } from './composer'
import { $composerBlockers, $preview, $tightestLimit } from './preview'

const mastodon: Account = {
  id: 'm1',
  platform: 'mastodon',
  displayName: 'M',
  handle: '@m@test',
  avatarUrl: null,
  instanceUrl: 'https://test',
  did: null,
  status: 'active',
  limits: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const bluesky: Account = {
  ...mastodon,
  id: 'b1',
  platform: 'bluesky',
  handle: '@b.test',
}

function openWith(partial: Partial<typeof $composer.value>): void {
  $composer.set({
    open: true,
    editingPostId: null,
    editingPostStatus: null,
    body: '',
    accountIds: [],
    overrides: {},
    overridePlatforms: [],
    media: [],
    scheduledAt: null,
    busy: false,
    ...partial,
  })
}

beforeEach(() => {
  $accounts.set([mastodon, bluesky])
  openWith({})
})

describe('preview store', () => {
  it('builds one preview per selected account with live counters', () => {
    openWith({ body: 'hello', accountIds: ['m1', 'b1'] })
    const previews = $preview.get()
    expect(previews).toHaveLength(2)
    expect(previews.map((preview) => preview.platform).sort()).toEqual(['bluesky', 'mastodon'])
    expect(previews[0].counter).toMatchObject({ used: 5, over: false })
  })

  it('shows only the Bluesky preview and counter when only Bluesky is selected', () => {
    openWith({ body: 'x'.repeat(400), accountIds: ['b1'] })
    expect($preview.get()).toHaveLength(1)
    expect($preview.get()[0].platform).toBe('bluesky')
    expect($preview.get()[0].counter.over).toBe(true)
    expect($tightestLimit.get()).toBe(BLUESKY_LIMITS.maxChars)
  })

  it('uses per-platform overrides when enabled', () => {
    openWith({
      body: 'base',
      accountIds: ['m1'],
      overrides: { m1: 'custom' },
      overridePlatforms: ['mastodon'],
    })
    expect($preview.get()[0].text).toBe('custom')
    expect($preview.get()[0].overridden).toBe(true)
  })

  it('flags image+video mixes for Bluesky but not Mastodon', () => {
    const media = [
      { mediaId: 'a', url: '/media/a', mime: 'image/png', altText: '', progress: null },
      { mediaId: 'b', url: '/media/b', mime: 'video/mp4', altText: '', progress: null },
    ]
    openWith({ body: 'hi', accountIds: ['b1'], media })
    expect($composerBlockers.get().join(' ')).toMatch(/cannot be combined/)
    openWith({ body: 'hi', accountIds: ['m1'], media })
    expect($composerBlockers.get()).toEqual([])
  })

  it('blocks scheduling with reasons for empty state', () => {
    openWith({})
    expect($composerBlockers.get()).toContain('Select at least one account')
  })
})
