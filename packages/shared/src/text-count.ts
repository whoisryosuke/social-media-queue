import { MASTODON_URL_LENGTH } from './limits.js'

const URL_PATTERN = /https?:\/\/[^\s<]+/g

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined

/** Counts user-perceived characters (graphemes). Falls back to code points without `Intl.Segmenter`. */
export function countGraphemes(text: string): number {
  if (segmenter !== undefined) {
    let count = 0
    for (const _ of segmenter.segment(text)) count += 1
    return count
  }
  return [...text].length
}

/**
 * Mastodon-weighted length: every URL counts as a fixed length
 * (`MASTODON_URL_LENGTH`, 23) toward the limit, the rest counts graphemes.
 */
export function mastodonLength(text: string, urlLength: number = MASTODON_URL_LENGTH): number {
  const normalized = text.replace(URL_PATTERN, 'x'.repeat(urlLength))
  return countGraphemes(normalized)
}

/**
 * Bluesky-weighted length: 300 graphemes. Equivalent to
 * `RichText.graphemeLength` from `@atproto/api` (which also uses
 * `Intl.Segmenter`); kept here so the UI can count without that dependency.
 */
export function blueskyLength(text: string): number {
  return countGraphemes(text)
}

/** Truncates to at most `limit` graphemes without splitting one. */
export function truncateToGraphemes(text: string, limit: number): string {
  if (segmenter === undefined) return [...text].slice(0, limit).join('')
  let count = 0
  let end = 0
  for (const segment of segmenter.segment(text)) {
    if (count >= limit) break
    count += 1
    end = (segment.index ?? 0) + segment.segment.length
  }
  return text.slice(0, end)
}
