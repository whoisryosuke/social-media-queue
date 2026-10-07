import { z } from 'zod'

export const platformSchema = z.enum(['mastodon', 'bluesky'])
export type Platform = z.infer<typeof platformSchema>

export const accountStatusSchema = z.enum(['active', 'needs_reauth'])
export type AccountStatus = z.infer<typeof accountStatusSchema>

export const postStatusSchema = z.enum([
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
])
export type PostStatus = z.infer<typeof postStatusSchema>

export const targetStatusSchema = z.enum(['pending', 'publishing', 'published', 'failed', 'cancelled'])
export type TargetStatus = z.infer<typeof targetStatusSchema>

export const mediaKindSchema = z.enum(['image', 'video'])
export type MediaKind = z.infer<typeof mediaKindSchema>
