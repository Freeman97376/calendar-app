import { defineConfig, devices } from '@playwright/test'

const mode = process.env.CALENDAR_E2E_MODE === 'server' ? 'server' : 'desktop'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.test\.ts/,
  testIgnore: mode === 'server' ? /^(?!.*server).*\.test\.ts/ : /server.*\.test\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: `test-results/playwright-${mode}`,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/e2e-launcher.mjs --mode ${mode}`,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 90_000,
  },
  projects: [
    {
      name: `chromium-${mode}`,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
