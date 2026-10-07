// Runs pending Drizzle migrations. Called on API start (task 3.2 wiring
// happens when the API gains its DB dependency in task 3.7).
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { loadEnv } from '../env.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: path.join(here, '..', '..', 'drizzle') })
  } finally {
    await pool.end()
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const env = loadEnv()
  await runMigrations(env.DATABASE_URL)
  console.log('migrations applied')
}
