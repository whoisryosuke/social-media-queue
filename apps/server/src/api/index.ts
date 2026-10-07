import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Database } from '../db/client.js'
import { accountsRoutes, oauthRoutes } from './accounts.js'
import { mediaFileRoutes, mediaRoutes } from './media.js'
import { postsRoutes } from './posts.js'
import { settingsRoutes } from './settings.js'

export interface ApiConfig {
  storageDir: string
  maxUploadMB: number
  encryptionKey: string
  apiOrigin: string
  webOrigin: string
}

export function createApp(webOrigin: string, database: Database, config: ApiConfig): Hono {
  const app = new Hono()
  // WEB_ORIGIN may be a comma-separated list (the web dev server shifts to
  // :4322 when :4321 is busy, which would otherwise fail CORS preflights).
  const origins = webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')
  app.use('/api/*', cors({ origin: origins }))
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/posts', postsRoutes(database))
  app.route('/api/settings', settingsRoutes(database))
  app.route('/api/media', mediaRoutes(database, config))
  app.route('/media', mediaFileRoutes(database))
  app.route('/api/accounts', accountsRoutes(database, config))
  app.route('/oauth', oauthRoutes(database, config))
  return app
}
