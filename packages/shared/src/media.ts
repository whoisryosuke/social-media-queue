import { z } from 'zod'
import { mediaKindSchema } from './enums'

const isoDate = z.coerce.date()

export const mediaSchema = z.object({
  id: z.string().uuid(),
  kind: mediaKindSchema,
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  originalFilename: z.string(),
  url: z.string(),
  createdAt: isoDate,
})
export type Media = z.infer<typeof mediaSchema>

export const postMediaSchema = z.object({
  mediaId: z.string().uuid(),
  position: z.number().int().min(0),
  altText: z.string().max(1500).nullable(),
})
export type PostMedia = z.infer<typeof postMediaSchema>

/** Attachment detail as returned by the API (includes serving info). */
export const postMediaDetailSchema = postMediaSchema.extend({
  url: z.string(),
  mime: z.string(),
})
export type PostMediaDetail = z.infer<typeof postMediaDetailSchema>
