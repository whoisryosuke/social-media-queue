import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Database } from '../db/client.js'
import { mediaFileRoutes, mediaRoutes } from './media.js'
import { postsRoutes } from './posts.js'
import { settingsRoutes } from './settings.js'

export interface ApiConfig {
  storageDir: string
  maxUploadMB: number
}

export function createApp(webOrigin: string, database: Database, config: ApiConfig): Hono {
  const app = new Hono()
  app.use('/api/*', cors({ origin: webOrigin }))
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/posts', postsRoutes(database))
  app.route('/api/settings', settingsRoutes(database))
  app.route('/api/media', mediaRoutes(database, config))
  app.route('/media', mediaFileRoutes(database))
  return app
}
