import { Hono } from 'hono'
import { cors } from 'hono/cors'

export function createApp(webOrigin: string): Hono {
  const app = new Hono()
  app.use('/api/*', cors({ origin: webOrigin }))
  app.get('/api/health', (c) => c.json({ ok: true }))
  return app
}
