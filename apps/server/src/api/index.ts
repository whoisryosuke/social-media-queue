import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Database } from '../db/client.js'
import { postsRoutes } from './posts.js'
import { settingsRoutes } from './settings.js'

export function createApp(webOrigin: string, database: Database): Hono {
  const app = new Hono()
  app.use('/api/*', cors({ origin: webOrigin }))
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/posts', postsRoutes(database))
  app.route('/api/settings', settingsRoutes(database))
  return app
}
