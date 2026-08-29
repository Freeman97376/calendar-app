import { spawn } from 'node:child_process'
import process from 'node:process'

import { resolvePythonExecutable } from './python-executable.mjs'

const args = process.argv.slice(2)
if (args.length === 0) {
  process.stderr.write('Usage: node scripts/run-python.mjs <python arguments...>\n')
  process.exit(2)
}

let python
try {
  python = resolvePythonExecutable()
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
  process.exit(1)
}

const child = spawn(python, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try {
      child.kill(signal)
    } catch {
      child.kill()
    }
  })
}

child.on('error', (error) => {
  process.stderr.write('Unable to start locked test Python: ' + error.message + '\n')
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 1))
