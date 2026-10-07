import { randomBytes } from 'node:crypto'
import { defineConfig } from '@playwright/test'

// Credential-free smoke stack: mock API on :4001, web on :4334.
// Run: pnpm --filter web exec playwright test -c playwright.mock.config.ts
const encryptionKey = randomBytes(32).toString('base64')

export default defineConfig({
  testDir: './e2e',
  testMatch: /connect\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:4334',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter server start:api',
      port: 4001,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        API_PORT: '4001',
        DATABASE_URL: 'postgresql://scheduler:scheduler@127.0.0.1:5432/scheduler_test',
        MOCK_PLATFORMS: 'true',
        ENCRYPTION_KEY: encryptionKey,
        WEB_ORIGIN: 'http://localhost:4334',
        PUBLIC_API_URL: 'http://localhost:4001',
        MAX_UPLOAD_MB: '25',
      },
    },
    {
      command: 'astro dev --port 4334',
      port: 4334,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PUBLIC_API_URL: 'http://localhost:4001',
      },
    },
  ],
})
