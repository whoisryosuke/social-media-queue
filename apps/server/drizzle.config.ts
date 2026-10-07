import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Used by `db:generate` (no live DB needed) and `db:migrate`.
    url: process.env.DATABASE_URL ?? 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler',
  },
})
