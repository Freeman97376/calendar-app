import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const binaryDir = path.resolve(root, 'src-tauri', 'binaries')
const expectedPrefix = path.resolve(root, 'src-tauri') + path.sep
if (!binaryDir.startsWith(expectedPrefix)) {
  throw new Error('Refusing to prepare a Rust check sidecar outside src-tauri.')
}

const rustc = spawnSync('rustc', ['-vV'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
if (rustc.status !== 0) {
  process.exit(rustc.status ?? 1)
}
const host = rustc.stdout
  .split(/\r?\n/)
  .find((line) => line.startsWith('host: '))
  ?.slice('host: '.length)
  .trim()
if (!host || !/^[a-z0-9_.-]+$/i.test(host)) {
  throw new Error('Unable to determine a safe Rust host target.')
}

fs.mkdirSync(binaryDir, { recursive: true })
const sidecarPath = path.join(
  binaryDir,
  `calendar-backend-${host}${host.includes('windows') ? '.exe' : ''}`,
)
const createdPlaceholder = !fs.existsSync(sidecarPath)
if (createdPlaceholder) {
  fs.writeFileSync(sidecarPath, '')
  if (!host.includes('windows')) fs.chmodSync(sidecarPath, 0o755)
}

let status = 1
try {
  const cargo = spawnSync(
    'cargo',
    ['check', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
  status = cargo.status ?? 1
} finally {
  if (createdPlaceholder) fs.rmSync(sidecarPath, { force: true })
}

process.exit(status)
