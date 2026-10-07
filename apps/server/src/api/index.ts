import { Hono } from 'hono'
import { cors } from 'hono/cors'
import pino from 'pino'
import type { Database } from '../db/client.js'
import { accountsRoutes, oauthRoutes, parseWebOrigins } from './accounts.js'
import { mediaFileRoutes, mediaRoutes } from './media.js'
import { postsRoutes } from './posts.js'
import { settingsRoutes } from './settings.js'

const log = pino({ name: 'api' })

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
  const origins = parseWebOrigins(webOrigin)
  app.use('/api/*', cors({ origin: origins }))
  app.use('/api/*', async (c, next) => {
    const started = Date.now()
    await next()
    log.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started },
      'request',
    )
  })
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/posts', postsRoutes(database))
  app.route('/api/settings', settingsRoutes(database))
  app.route('/api/media', mediaRoutes(database, config))
  app.route('/media', mediaFileRoutes(database))
  app.route('/api/accounts', accountsRoutes(database, config))
  app.route('/oauth', oauthRoutes(database, config))
  return app
}
