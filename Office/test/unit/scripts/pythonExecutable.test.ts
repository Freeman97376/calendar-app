import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolvePythonExecutable } from '../../../../scripts/python-executable.mjs'

const temporaryRoots: string[] = []

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-python-resolver-'))
  temporaryRoots.push(root)
  return root
}

function createFile(root: string, relativePath: string) {
  const candidate = path.join(root, ...relativePath.split('/'))
  fs.mkdirSync(path.dirname(candidate), { recursive: true })
  fs.writeFileSync(candidate, '')
  return candidate
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true })
  }
})

describe('locked test Python resolver', () => {
  it('uses an explicit existing executable file', () => {
    const root = temporaryRoot()
    const explicit = createFile(root, 'tools/python-custom')

    expect(
      resolvePythonExecutable({
        env: { PYTHON_EXECUTABLE: explicit },
        platform: 'win32',
        root,
      }),
    ).toBe(explicit)
  })

  it('resolves an explicit relative file from the repository root', () => {
    const root = temporaryRoot()
    const explicit = createFile(root, 'tools/python-custom')

    expect(
      resolvePythonExecutable({
        env: { PYTHON_EXECUTABLE: 'tools/python-custom' },
        platform: 'linux',
        root,
      }),
    ).toBe(explicit)
  })

  it('rejects an explicit directory or missing path', () => {
    const root = temporaryRoot()
    fs.mkdirSync(path.join(root, 'not-a-file'))

    expect(() =>
      resolvePythonExecutable({
        env: { PYTHON_EXECUTABLE: 'not-a-file' },
        root,
      }),
    ).toThrow('existing Python executable file')
    expect(() =>
      resolvePythonExecutable({
        env: { PYTHON_EXECUTABLE: 'missing-python' },
        root,
      }),
    ).toThrow('existing Python executable file')
  })

  it('prefers the Windows locked environment on Windows', () => {
    const root = temporaryRoot()
    const python = createFile(root, '.venv-test/Scripts/python.exe')
    createFile(root, '.venv-test/bin/python')

    expect(resolvePythonExecutable({ env: {}, platform: 'win32', root })).toBe(python)
  })

  it('prefers the POSIX locked environment on POSIX', () => {
    const root = temporaryRoot()
    createFile(root, '.venv-test/Scripts/python.exe')
    const python = createFile(root, '.venv-test/bin/python')

    expect(resolvePythonExecutable({ env: {}, platform: 'linux', root })).toBe(python)
  })

  it('fails closed instead of searching PATH', () => {
    const root = temporaryRoot()

    expect(() =>
      resolvePythonExecutable({
        env: { PATH: root },
        platform: 'win32',
        root,
      }),
    ).toThrow('Locked test Python is unavailable')
  })
})
