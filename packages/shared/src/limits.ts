import { z } from 'zod'

/**
 * Cached per-account platform limits (stored in `accounts.limits_json`).
 * Mastodon values come from `GET /api/v2/instance`; Bluesky values are the
 * well-known constants below (see `limits.ts`).
 */
export const platformLimitsSchema = z.object({
  maxChars: z.number().int().positive(),
  maxImages: z.number().int().min(0),
  maxVideos: z.number().int().min(0),
  maxImageBytes: z.number().int().positive(),
  maxVideoBytes: z.number().int().positive(),
  allowedImageMimes: z.array(z.string()),
  allowedVideoMimes: z.array(z.string()),
  /** Whether images and video may be mixed in one post. */
  allowImageVideoMix: z.boolean(),
})
export type PlatformLimits = z.infer<typeof platformLimitsSchema>

/** Fallback limits used before an account's real limits are fetched. */
export const DEFAULT_MASTODON_LIMITS: PlatformLimits = {
  maxChars: 500,
  maxImages: 4,
  maxVideos: 4,
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 40 * 1024 * 1024,
  allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedVideoMimes: ['video/mp4', 'video/webm'],
  allowImageVideoMix: true,
}

export const BLUESKY_LIMITS: PlatformLimits = {
  maxChars: 300,
  maxImages: 4,
  maxVideos: 1,
  maxImageBytes: 1 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoMimes: ['video/mp4'],
  allowImageVideoMix: false,
}

/** Mastodon counts every URL as a fixed length toward the character limit. */
export const MASTODON_URL_LENGTH = 23
