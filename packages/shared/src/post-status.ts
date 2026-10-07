import type { PostStatus, TargetStatus } from './enums.js'

/**
 * Derives a post's status from its targets' statuses (PLAN section 5).
 *
 * Rules:
 * - `publishing` when any target is in progress.
 * - `published` when all targets published.
 * - `partial` when some published and some failed.
 * - `failed` when all failed.
 * - `scheduled` otherwise (work still queued).
 *
 * `cancelled` targets count as `failed` (terminal but unsuccessful), so
 * cancelling every target surfaces as `failed` instead of a post that looks
 * scheduled forever. Callers must not run this for `draft` posts (drafts
 * have no schedule and keep their status until promoted).
 */
export function derivePostStatus(targetStatuses: TargetStatus[]): PostStatus {
  const normalized = targetStatuses.map((status) => (status === 'cancelled' ? 'failed' : status))
  if (normalized.length === 0) return 'scheduled'
  if (normalized.includes('publishing')) return 'publishing'
  const published = normalized.filter((status) => status === 'published').length
  const failed = normalized.filter((status) => status === 'failed').length
  if (published === normalized.length) return 'published'
  if (published > 0 && failed > 0) return 'partial'
  if (failed === normalized.length) return 'failed'
  return 'scheduled'
}
