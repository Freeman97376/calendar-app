import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const mode = process.argv[2]
if (!['desktop', 'server'].includes(mode)) {
  process.stderr.write('Usage: node scripts/run-playwright.mjs <desktop|server>\n')
  process.exit(2)
}

const root = path.resolve(import.meta.dirname, '..')
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js')
const child = spawn(process.execPath, [cli, 'test'], {
  cwd: root,
  env: { ...process.env, CALENDAR_E2E_MODE: mode },
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
