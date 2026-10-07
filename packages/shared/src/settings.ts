import { z } from 'zod'

export const settingsSchema = z.object({
  timezone: z.string().default('UTC'),
  latePublishGraceMinutes: z.number().int().positive().nullable().default(null),
  defaultAccountIds: z.array(z.string().uuid()).default([]),
})
export type Settings = z.infer<typeof settingsSchema>

export const updateSettingsSchema = settingsSchema.partial()
export type UpdateSettings = z.infer<typeof updateSettingsSchema>
