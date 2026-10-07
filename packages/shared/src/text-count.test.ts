import { describe, expect, it } from 'vitest'
import { MASTODON_URL_LENGTH } from './limits.js'
import { blueskyLength, countGraphemes, mastodonLength, truncateToGraphemes } from './text-count.js'

describe('countGraphemes', () => {
  it('counts plain text by characters', () => {
    expect(countGraphemes('hello')).toBe(5)
  })

  it('counts emoji and ZWJ sequences as single graphemes', () => {
    expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1)
    expect(countGraphemes('a👍b')).toBe(3)
  })

  it('counts combining marks with their base character', () => {
    expect(countGraphemes('é')).toBe(1)
  })
})

describe('mastodonLength', () => {
  it('counts each URL as 23 chars', () => {
    const text = 'see https://example.com/a/very/long/path for details'
    expect(mastodonLength(text)).toBe(
      countGraphemes('see ') + MASTODON_URL_LENGTH + countGraphemes(' for details'),
    )
  })

  it('handles multiple URLs', () => {
    expect(mastodonLength('https://a.co x https://b.co')).toBe(MASTODON_URL_LENGTH * 2 + 3)
  })

  it('equals the grapheme count when there are no URLs', () => {
    expect(mastodonLength('plain 👍')).toBe(countGraphemes('plain 👍'))
  })
})

describe('blueskyLength', () => {
  it('counts graphemes without URL weighting', () => {
    expect(blueskyLength('https://example.com/very/long')).toBe(countGraphemes('https://example.com/very/long'))
    expect(blueskyLength('👨‍👩‍👧‍👦')).toBe(1)
  })
})

describe('truncateToGraphemes', () => {
  it('truncates without splitting graphemes', () => {
    expect(truncateToGraphemes('a👍bc', 2)).toBe('a👍')
    expect(truncateToGraphemes('abc', 10)).toBe('abc')
  })
})
