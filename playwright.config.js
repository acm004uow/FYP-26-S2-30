const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env.e2e') })

const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  // Several specs share state across their tests via a file-scoped test.beforeAll (seeded
  // bookings, etc). Under fullyParallel, Playwright schedules tests (not just files) across
  // workers, which re-runs that beforeAll once per worker a file's tests land on — duplicating
  // the seed data and breaking every locator that assumes one matching row. Keeping tests within
  // a file serial (default fullyParallel:false) avoids that; different files still run in
  // parallel across workers.
  fullyParallel: false,
  timeout: 90000, // next dev JIT-compiles each route on first visit; give that room under load.
  workers: 4, // cap concurrency against the single shared dev server as the suite has grown — more
  // workers just means more simultaneous first-compiles competing for the same process.
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // Stands in for Azure OpenAI (see e2e/mocks/azure-openai-mock.js) so AI-04's tool-selection
      // routing test is deterministic and free — nothing else in this suite calls the AI agent.
      command: `node e2e/mocks/azure-openai-mock.js`,
      port: 4010,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        CRON_SECRET: process.env.CRON_SECRET || '',
        AZURE_OPENAI_ENDPOINT: 'http://localhost:4010/openai/v1',
        AZURE_OPENAI_DEPLOYMENT: 'mock-deployment',
        AZURE_OPENAI_API_KEY: 'mock-key',
      },
    },
  ],
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /mobile-responsive\.spec\.js/,
    },
    {
      // NFR-03. A dedicated, read-only, project-scoped spec (not shared with 'chromium') — running
      // the same file under two projects concurrently re-runs its beforeAll per project and
      // double-seeds, per the note this replaced.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /mobile-responsive\.spec\.js/,
    },
  ],
})
