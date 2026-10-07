import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { loadEnv } from '../env.js'
import * as schema from './schema.js'

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl })
}

export function createDb(pool: Pool): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(pool, { schema })
}

export type Database = ReturnType<typeof createDb>

// Default instance used by the API and worker entrypoints.
const env = loadEnv()
export const pool = createPool(env.DATABASE_URL)
export const db = createDb(pool)
