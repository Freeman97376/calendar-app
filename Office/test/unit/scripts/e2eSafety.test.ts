import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const launcher = path.join(root, 'scripts', 'e2e-launcher.mjs')
const mysqlRunner = path.join(root, 'scripts', 'test-mysql.ps1')
const playwrightRunner = path.join(root, 'scripts', 'run-playwright.mjs')
const disposableUrl =
  'mysql+pymysql://calendar_test:calendar_test@127.0.0.1:3306/calendar_test?charset=utf8mb4'

function isolatedEnv(overrides: Record<string, string> = {}) {
  const env = { ...process.env }
  delete env.CALENDAR_DATABASE_URL
  delete env.CALENDAR_E2E_API_PORT
  delete env.CALENDAR_E2E_DATABASE_URL
  delete env.CALENDAR_E2E_WEB_PORT
  return { ...env, ...overrides }
}

function validateServer(overrides: Record<string, string>) {
  return spawnSync(process.execPath, [launcher, '--mode', 'server', '--validate-only'], {
    cwd: root,
    encoding: 'utf8',
    env: isolatedEnv(overrides),
  })
}

function validateDesktop(overrides: Record<string, string>) {
  return spawnSync(process.execPath, [launcher, '--mode', 'desktop', '--validate-only'], {
    cwd: root,
    encoding: 'utf8',
    env: isolatedEnv(overrides),
  })
}

describe('E2E launcher safety', () => {
  it('never falls back to the ordinary application database URL', () => {
    const result = validateServer({ CALENDAR_DATABASE_URL: disposableUrl })
    const output = result.stdout + result.stderr

    expect(result.status).not.toBe(0)
    expect(output).toContain('requires an explicit CALENDAR_E2E_DATABASE_URL')
  })

  it('rejects a non-test database without exposing its password', () => {
    const result = validateServer({
      CALENDAR_E2E_DATABASE_URL:
        'mysql+pymysql://calendar_user:super-secret@example.invalid/calendar_prod',
    })
    const output = result.stdout + result.stderr

    expect(result.status).not.toBe(0)
    expect(output).toContain('dedicated database')
    expect(output).not.toContain('super-secret')
  })

  it('accepts an explicit dedicated MySQL test database without connecting', () => {
    const result = validateServer({ CALENDAR_E2E_DATABASE_URL: disposableUrl })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('E2E_CONFIGURATION_VALID mode=server database=calendar_test')
  })

  it('isolates desktop E2E from inherited server database and seed settings', () => {
    const result = validateDesktop({
      CALENDAR_DATABASE_URL:
        'mysql+pymysql://calendar_user:super-secret@example.invalid/calendar_prod',
      CALENDAR_E2E_ALLOW_SEED: '1',
      CALENDAR_E2E_DATABASE_URL: disposableUrl,
      CALENDAR_E2E_PASSWORD: 'super-secret-password',
    })
    const output = result.stdout + result.stderr

    expect(result.status).toBe(0)
    expect(output).toContain('E2E_CONFIGURATION_VALID mode=desktop database=isolated-sqlite')
    expect(output).not.toContain('super-secret')
  })

  it('auto-selects distinct desktop web and API ports', () => {
    const result = spawnSync(process.execPath, [playwrightRunner, 'desktop', '--print-config'], {
      cwd: root,
      encoding: 'utf8',
      env: isolatedEnv(),
    })

    expect(result.status).toBe(0)
    const config = JSON.parse(result.stdout) as {
      apiPort: number
      autoSelectedApiPort: boolean
      autoSelectedWebPort: boolean
      webPort: number
    }
    expect(config.autoSelectedApiPort).toBe(true)
    expect(config.autoSelectedWebPort).toBe(true)
    expect(config.apiPort).not.toBe(config.webPort)
  })

  it('fails the MySQL aggregate gate when final Docker cleanup fails', () => {
    const source = readFileSync(mysqlRunner, 'utf8')

    expect(source).toContain('$cleanupError = $null')
    expect(source).toContain('$cleanupError = $_')
    expect(source).toMatch(/if \(\$null -ne \$cleanupError\) \{\s+throw \$cleanupError\s+\}/u)
    expect(source).not.toContain('Docker cleanup could not contact the Docker daemon')
  })
})
