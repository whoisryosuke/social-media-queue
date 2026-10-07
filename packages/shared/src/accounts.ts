import { z } from 'zod'
import { accountStatusSchema, platformSchema } from './enums'

const isoDate = z.coerce.date()

export const accountSchema = z.object({
  id: z.string().uuid(),
  platform: platformSchema,
  displayName: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  instanceUrl: z.string().nullable(),
  did: z.string().nullable(),
  status: accountStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Account = z.infer<typeof accountSchema>

export const mastodonConnectStartSchema = z.object({
  instanceUrl: z.string().min(1, 'Instance URL is required'),
})
export type MastodonConnectStart = z.infer<typeof mastodonConnectStartSchema>

export const mastodonConnectStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
})
export type MastodonConnectStartResponse = z.infer<typeof mastodonConnectStartResponseSchema>

export const blueskyConnectSchema = z.object({
  handle: z.string().min(1, 'Handle is required'),
  appPassword: z.string().min(1, 'App password is required'),
  service: z.string().url().optional(),
})
export type BlueskyConnect = z.infer<typeof blueskyConnectSchema>
