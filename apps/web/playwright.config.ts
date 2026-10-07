import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: /connect\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:4333',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter server start:api',
      port: 4000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'astro dev --port 4333',
      port: 4333,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
