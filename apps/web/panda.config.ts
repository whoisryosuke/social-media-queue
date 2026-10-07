import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  // No custom theme yet (arrives after Phase 1 stop point).
  // Default Panda preset only; no custom tokens invented here.
  preflight: true,
  include: ['./src/**/*.{ts,tsx,astro}'],
  exclude: [],
  outdir: 'styled-system',
})
