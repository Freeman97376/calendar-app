import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { resolvePythonExecutable } from './python-executable.mjs'

const root = path.resolve(import.meta.dirname, '..')
const modeIndex = process.argv.indexOf('--mode')
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'desktop'
if (!['desktop', 'server'].includes(mode)) throw new Error('E2E mode must be desktop or server.')
const validateOnly = process.argv.includes('--validate-only')

const disposableDatabaseNamePattern = /(?:^|[_-])(?:test|e2e)(?:$|[_-])/i

function requireDisposableMysqlUrl(value) {
  if (!value) {
    throw new Error(
      'Server E2E requires an explicit CALENDAR_E2E_DATABASE_URL. CALENDAR_DATABASE_URL is never used as a fallback.',
    )
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('CALENDAR_E2E_DATABASE_URL must be a valid MySQL SQLAlchemy URL.')
  }
  if (!parsed.protocol.toLowerCase().startsWith('mysql+')) {
    throw new Error('CALENDAR_E2E_DATABASE_URL must use an explicit mysql+ SQLAlchemy driver.')
  }

  let pathSegments
  try {
    pathSegments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
  } catch {
    throw new Error('CALENDAR_E2E_DATABASE_URL contains an invalid database name.')
  }
  if (pathSegments.length !== 1 || !disposableDatabaseNamePattern.test(pathSegments[0])) {
    throw new Error(
      'CALENDAR_E2E_DATABASE_URL must target a dedicated database whose name contains a test or e2e segment.',
    )
  }
  return pathSegments[0]
}

const webPort = process.env.CALENDAR_E2E_WEB_PORT || '5173'
const apiPort = process.env.CALENDAR_E2E_API_PORT || '8787'
const webUrl = `http://127.0.0.1:${webPort}`
const apiUrl = `http://127.0.0.1:${apiPort}`

const artifactDir = path.join(root, 'test-results', `e2e-${mode}`)
const normalizedRoot = path.resolve(root) + path.sep
const normalizedArtifacts = path.resolve(artifactDir)
if (!normalizedArtifacts.startsWith(normalizedRoot))
  throw new Error('Refusing to use an E2E directory outside the repository.')
fs.mkdirSync(artifactDir, { recursive: true })

const children = new Set()
let shuttingDown = false
function stop(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  setTimeout(() => process.exit(code), 250).unref()
}

function logStream(child, name) {
  const logPath = path.join(artifactDir, `${name}.log`)
  const output = fs.createWriteStream(logPath, { flags: 'w' })
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.on('data', (chunk) => {
      output.write(chunk)
      target.write(`[${name}] ${chunk}`)
    })
  }
  child.on('close', () => output.end())
}

function start(command, args, name, env) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  logStream(child, name)
  child.on('error', (error) => {
    process.stderr.write(`${name} failed to start: ${error.message}\n`)
    stop(1)
  })
  child.on('exit', (code) => {
    children.delete(child)
    if (!shuttingDown && code !== 0) {
      process.stderr.write(`${name} exited unexpectedly with code ${code}.\n`)
      stop(code ?? 1)
    }
  })
  return child
}

function checked(command, args, env, label) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${label} failed.\n${result.stdout || ''}${result.stderr || ''}`)
  }
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

const commonEnv = {
  ...process.env,
  CALENDAR_ALLOWED_ORIGINS: webUrl,
  CALENDAR_LOG_LEVEL: 'warning',
}

let backendEnv
let python
if (mode === 'desktop') {
  const dataDir = path.join(artifactDir, 'data')
  const normalizedData = path.resolve(dataDir)
  if (!normalizedData.startsWith(normalizedArtifacts + path.sep)) {
    throw new Error('Refusing to reset an E2E data directory outside test-results.')
  }
  fs.rmSync(dataDir, { force: true, recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })
  backendEnv = {
    ...commonEnv,
    CALENDAR_APP_MODE: 'desktop',
    CALENDAR_DATA_DIR: dataDir,
    FRIDGE_DATA_DIR: dataDir,
  }
  for (const key of [
    'CALENDAR_DATABASE_URL',
    'CALENDAR_E2E_ALLOW_SEED',
    'CALENDAR_E2E_DATABASE_URL',
    'CALENDAR_E2E_PASSWORD',
  ]) {
    delete backendEnv[key]
  }
  if (validateOnly) {
    process.stdout.write('E2E_CONFIGURATION_VALID mode=desktop database=isolated-sqlite\n')
    process.exit(0)
  }
} else {
  const databaseUrl = process.env.CALENDAR_E2E_DATABASE_URL?.trim() ?? ''
  const databaseName = requireDisposableMysqlUrl(databaseUrl)
  const password = process.env.CALENDAR_E2E_PASSWORD || 'Calendar-E2E-Password-123!'
  backendEnv = {
    ...commonEnv,
    CALENDAR_APP_MODE: 'server',
    CALENDAR_DATABASE_URL: databaseUrl,
    CALENDAR_E2E_ALLOW_SEED: '1',
    CALENDAR_E2E_PASSWORD: password,
    SESSION_COOKIE_SECURE: '0',
  }
  if (validateOnly) {
    process.stdout.write('E2E_CONFIGURATION_VALID mode=server database=' + databaseName + '\n')
    process.exit(0)
  }
  python = resolvePythonExecutable({ root })
  checked(
    python,
    ['-m', 'alembic', '-x', `database_url=${databaseUrl}`, 'upgrade', 'head'],
    backendEnv,
    'MySQL E2E migration',
  )
  checked(python, ['scripts/seed-e2e-users.py'], backendEnv, 'E2E account seed')
}

python ??= resolvePythonExecutable({ root })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
process.on('uncaughtException', (error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  stop(1)
})

start(
  python,
  ['-m', 'backend.server', '--mode', mode, '--host', '127.0.0.1', '--port', apiPort],
  'backend',
  backendEnv,
)
await waitFor(`${apiUrl}/api/health`, 'Calendar API')

const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
start(
  process.execPath,
  [viteCli, '--host', '127.0.0.1', '--port', webPort, '--strictPort'],
  'vite',
  { ...commonEnv, VITE_API_BASE_URL: apiUrl },
)
await waitFor(webUrl, 'Vite')
process.stdout.write(`E2E_READY mode=${mode}\n`)
await new Promise(() => {})
