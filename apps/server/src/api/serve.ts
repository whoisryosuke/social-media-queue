import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './index.js'
import { loadEnv } from '../env.js'

const env = loadEnv()

serve(
  {
    fetch: createApp(env.WEB_ORIGIN).fetch,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`api listening on http://localhost:${info.port}`)
  },
)
