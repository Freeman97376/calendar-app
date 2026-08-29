import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(import.meta.dirname, '..')

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

export function resolvePythonExecutable(options = {}) {
  const root = path.resolve(options.root ?? repositoryRoot)
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const configured = env.PYTHON_EXECUTABLE?.trim()

  if (configured) {
    const candidate = path.isAbsolute(configured)
      ? path.normalize(configured)
      : path.resolve(root, configured)
    if (!isFile(candidate)) {
      throw new Error(
        'PYTHON_EXECUTABLE must point to an existing Python executable file: ' + candidate,
      )
    }
    return candidate
  }

  const windowsCandidate = path.join(root, '.venv-test', 'Scripts', 'python.exe')
  const posixCandidate = path.join(root, '.venv-test', 'bin', 'python')
  const candidates =
    platform === 'win32' ? [windowsCandidate, posixCandidate] : [posixCandidate, windowsCandidate]
  const resolved = candidates.find(isFile)
  if (resolved) return resolved

  throw new Error(
    'Locked test Python is unavailable. Set PYTHON_EXECUTABLE to an existing file or create ' +
      path.join(root, '.venv-test') +
      ' with Scripts/python.exe (Windows) or bin/python (POSIX).',
  )
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(resolvePythonExecutable() + '\n')
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}
