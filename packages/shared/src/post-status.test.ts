import { describe, expect, it } from 'vitest'
import type { TargetStatus } from './enums.js'
import { derivePostStatus } from './post-status.js'

describe('derivePostStatus', () => {
  it('returns published when every target published', () => {
    expect(derivePostStatus(['published', 'published'])).toBe('published')
  })

  it('returns partial when some published and some failed', () => {
    expect(derivePostStatus(['published', 'failed'])).toBe('partial')
  })

  it('returns failed when every target failed', () => {
    expect(derivePostStatus(['failed', 'failed'])).toBe('failed')
  })

  it('returns publishing when any target is in progress', () => {
    expect(derivePostStatus(['published', 'publishing'])).toBe('publishing')
    expect(derivePostStatus(['pending', 'publishing', 'failed'])).toBe('publishing')
  })

  it('returns scheduled while work is still queued', () => {
    expect(derivePostStatus(['pending'])).toBe('scheduled')
    expect(derivePostStatus(['pending', 'pending'])).toBe('scheduled')
    expect(derivePostStatus(['pending', 'published'])).toBe('scheduled')
    expect(derivePostStatus(['pending', 'failed'])).toBe('scheduled')
  })

  it('treats cancelled targets as failed', () => {
    expect(derivePostStatus(['cancelled', 'cancelled'])).toBe('failed')
    expect(derivePostStatus(['published', 'cancelled'])).toBe('partial')
  })

  it('returns scheduled for a post with no targets', () => {
    expect(derivePostStatus([] as TargetStatus[])).toBe('scheduled')
  })
})
