/* global fetch, setTimeout */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const modeIndex = process.argv.indexOf('--mode')
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'desktop'
if (!['desktop', 'server'].includes(mode)) throw new Error('E2E mode must be desktop or server.')

const python =
  process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3')
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
  CALENDAR_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
  CALENDAR_LOG_LEVEL: 'warning',
}
const apiUrl = 'http://127.0.0.1:8787'
let backendEnv
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
} else {
  const databaseUrl = process.env.CALENDAR_E2E_DATABASE_URL || process.env.CALENDAR_DATABASE_URL
  if (!databaseUrl?.startsWith('mysql+')) {
    throw new Error('Server E2E requires CALENDAR_E2E_DATABASE_URL with a MySQL SQLAlchemy URL.')
  }
  const password = process.env.CALENDAR_E2E_PASSWORD || 'Calendar-E2E-Password-123!'
  backendEnv = {
    ...commonEnv,
    CALENDAR_APP_MODE: 'server',
    CALENDAR_DATABASE_URL: databaseUrl,
    CALENDAR_E2E_ALLOW_SEED: '1',
    CALENDAR_E2E_PASSWORD: password,
    SESSION_COOKIE_SECURE: '0',
  }
  checked(
    python,
    ['-m', 'alembic', '-x', `database_url=${databaseUrl}`, 'upgrade', 'head'],
    backendEnv,
    'MySQL E2E migration',
  )
  checked(python, ['scripts/seed-e2e-users.py'], backendEnv, 'E2E account seed')
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0))
process.on('uncaughtException', (error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  stop(1)
})

start(
  python,
  ['-m', 'backend.server', '--mode', mode, '--host', '127.0.0.1', '--port', '8787'],
  'backend',
  backendEnv,
)
await waitFor(`${apiUrl}/api/health`, 'Calendar API')

const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
start(
  process.execPath,
  [viteCli, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  'vite',
  { ...commonEnv, VITE_API_BASE_URL: apiUrl },
)
await waitFor('http://127.0.0.1:5173', 'Vite')
process.stdout.write(`E2E_READY mode=${mode}\n`)
await new Promise(() => {})
