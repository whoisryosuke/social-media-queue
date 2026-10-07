import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './index.js'
import { runMigrations } from '../db/migrate.js'
import { db } from '../db/client.js'
import { loadEnv } from '../env.js'

const env = loadEnv()

await runMigrations(env.DATABASE_URL)

serve(
  {
    fetch: createApp(env.WEB_ORIGIN, db).fetch,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`api listening on http://localhost:${info.port}`)
  },
)
