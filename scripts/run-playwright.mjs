import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'

const mode = process.argv[2]
if (!['desktop', 'server'].includes(mode)) {
  process.stderr.write('Usage: node scripts/run-playwright.mjs <desktop|server>\n')
  process.exit(2)
}

const root = path.resolve(import.meta.dirname, '..')
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
const childEnv = { ...process.env, CALENDAR_E2E_MODE: mode }
delete childEnv.NO_COLOR

function checkedPort(value, label) {
  if (!/^\d+$/.test(value)) throw new Error(label + ' must be an integer TCP port.')
  const port = Number(value)
  if (port < 1 || port > 65_535) throw new Error(label + ' must be between 1 and 65535.')
  return port
}

function availableTcpPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to resolve an available loopback TCP port.'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

let autoSelectedWebPort = false
let autoSelectedApiPort = false
if (mode === 'desktop') {
  if (!childEnv.CALENDAR_E2E_WEB_PORT) {
    childEnv.CALENDAR_E2E_WEB_PORT = String(await availableTcpPort())
    autoSelectedWebPort = true
  }
  if (!childEnv.CALENDAR_E2E_API_PORT) {
    do {
      childEnv.CALENDAR_E2E_API_PORT = String(await availableTcpPort())
    } while (childEnv.CALENDAR_E2E_API_PORT === childEnv.CALENDAR_E2E_WEB_PORT)
    autoSelectedApiPort = true
  }
}

const webPort = checkedPort(childEnv.CALENDAR_E2E_WEB_PORT || '5173', 'CALENDAR_E2E_WEB_PORT')
const apiPort = checkedPort(childEnv.CALENDAR_E2E_API_PORT || '8787', 'CALENDAR_E2E_API_PORT')
if (webPort === apiPort) throw new Error('Calendar E2E web and API ports must be different.')

if (process.argv.includes('--print-config')) {
  process.stdout.write(
    JSON.stringify({ apiPort, autoSelectedApiPort, autoSelectedWebPort, mode, webPort }) + '\n',
  )
  process.exit(0)
}

const child = spawn(process.execPath, [cli, 'test'], {
  cwd: root,
  env: childEnv,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  process.stderr.write(`Unable to start Playwright: ${error.message}\n`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 1))
