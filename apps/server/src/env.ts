import dotenv from 'dotenv'
import { z } from 'zod'

// `pnpm --filter server` runs with cwd=apps/server, so the repo-root .env
// (../../.env) is not found by default. Load it explicitly; dotenv never
// overrides already-set variables, so real env always wins.
dotenv.config({ path: '../../.env' })
dotenv.config({ path: '../.env' })
dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler'),
  ENCRYPTION_KEY: z.string().default('dev-only-key'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  WEB_ORIGIN: z.string().default('http://localhost:4321'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`)
  }
  return parsed.data
}
