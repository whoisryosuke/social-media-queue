import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/api/serve.ts', 'src/worker/run.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // Workspace-linked TS source must be inlined; everything in node_modules
  // (sharp, pg, drizzle, …) stays external for the deployed install.
  noExternal: ['@social-scheduler/shared'],
})
