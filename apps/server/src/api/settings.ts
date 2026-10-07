import { Hono, type Context } from 'hono'
import { settingsSchema, updateSettingsSchema, type Settings } from '@social-scheduler/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { settings } from '../db/schema.js'

function error(c: Context, message: string, status = 400): Response {
  return c.json({ error: message }, status as 400)
}

const DEFAULTS = settingsSchema.parse({})

export async function readSettings(db: Database): Promise<Settings> {
  const rows = await db.select().from(settings)
  const values: Record<string, unknown> = {}
  for (const row of rows) values[row.key] = row.value
  return settingsSchema.parse({
    timezone: values.timezone ?? DEFAULTS.timezone,
    latePublishGraceMinutes: values.latePublishGraceMinutes ?? DEFAULTS.latePublishGraceMinutes,
    defaultAccountIds: values.defaultAccountIds ?? DEFAULTS.defaultAccountIds,
  })
}

export function settingsRoutes(db: Database): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => c.json(await readSettings(db)))

  routes.patch('/', async (c) => {
    const parsed = updateSettingsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return error(c, parsed.error.message)
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
    }
    return c.json(await readSettings(db))
  })

  return routes
}
