import { defineConfig, devices } from '@playwright/test'

const mode = process.env.CALENDAR_E2E_MODE === 'server' ? 'server' : 'desktop'
const webServerEnv: Record<string, string> = {}
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) webServerEnv[key] = value
}
delete webServerEnv.NO_COLOR
const webServerPort = process.env.CALENDAR_E2E_WEB_PORT || '5173'
const apiServerPort = process.env.CALENDAR_E2E_API_PORT || '8787'
webServerEnv.CALENDAR_E2E_WEB_PORT = webServerPort
webServerEnv.CALENDAR_E2E_API_PORT = apiServerPort
const webServerURL = `http://127.0.0.1:${webServerPort}`

export default defineConfig({
  testDir: './Office/test/e2e',
  testMatch: /.*\.test\.ts/,
  testIgnore: mode === 'server' ? /^(?!.*server).*\.test\.ts/ : /server.*\.test\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: `test-results/playwright-${mode}`,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: webServerURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/e2e-launcher.mjs --mode ${mode}`,
    env: webServerEnv,
    url: webServerURL,
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
