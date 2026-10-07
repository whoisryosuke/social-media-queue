import { z } from 'zod'
import { postStatusSchema, targetStatusSchema } from './enums'
import { postMediaSchema } from './media'

const isoDate = z.coerce.date()

export const postTargetSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  accountId: z.string().uuid(),
  bodyOverride: z.string().nullable(),
  status: targetStatusSchema,
  attempts: z.number().int().min(0),
  nextAttemptAt: isoDate.nullable(),
  remoteId: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  lastError: z.string().nullable(),
  publishedAt: isoDate.nullable(),
})
export type PostTarget = z.infer<typeof postTargetSchema>

export const postSchema = z.object({
  id: z.string().uuid(),
  status: postStatusSchema,
  body: z.string(),
  scheduledAt: isoDate.nullable(),
  targets: z.array(postTargetSchema),
  media: z.array(postMediaSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Post = z.infer<typeof postSchema>

const attachmentInput = z.object({
  mediaId: z.string().uuid(),
  altText: z.string().max(1500).optional(),
})

const scheduledAtInput = z
  .string()
  .datetime({ offset: true })
  .refine((value) => new Date(value).getTime() > Date.now(), {
    message: 'scheduledAt must be in the future',
  })

export const createPostSchema = z.object({
  body: z.string().max(5000).default(''),
  accountIds: z.array(z.string().uuid()).min(1, 'At least one target account is required').optional(),
  bodyOverrides: z.record(z.string().uuid(), z.string().max(5000)).optional(),
  media: z.array(attachmentInput).max(4).optional(),
  scheduledAt: scheduledAtInput.optional(),
})
export type CreatePost = z.infer<typeof createPostSchema>

export const updatePostSchema = z.object({
  body: z.string().max(5000).optional(),
  accountIds: z.array(z.string().uuid()).min(1).optional(),
  bodyOverrides: z.record(z.string().uuid(), z.string().max(5000)).nullable().optional(),
  media: z.array(attachmentInput).max(4).optional(),
  scheduledAt: scheduledAtInput.nullable().optional(),
})
export type UpdatePost = z.infer<typeof updatePostSchema>

export const schedulePostSchema = z.object({
  scheduledAt: scheduledAtInput,
})
export type SchedulePost = z.infer<typeof schedulePostSchema>

export const listPostsQuerySchema = z.object({
  status: postStatusSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>
