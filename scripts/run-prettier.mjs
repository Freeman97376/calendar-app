import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const requestedMode = process.argv[2]
const prettierMode =
  requestedMode === 'write' ? '--write' : requestedMode === 'check' ? '--check' : null

if (!prettierMode) {
  console.error('Usage: node scripts/run-prettier.mjs <write|check>')
  process.exit(2)
}

const listResult = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  windowsHide: true,
})

if (listResult.error) {
  throw listResult.error
}

if (listResult.status !== 0) {
  process.stderr.write(listResult.stderr ?? 'Unable to list tracked files.\n')
  process.exit(listResult.status ?? 1)
}

const files = listResult.stdout.split('\0').filter(Boolean)
const prettierCli = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
)
const maxArgumentCharacters = 24_000
let batch = []
let batchCharacters = 0
let exitCode = 0

function runBatch() {
  if (batch.length === 0) {
    return
  }

  const result = spawnSync(
    process.execPath,
    [prettierCli, prettierMode, '--ignore-unknown', ...batch],
    { stdio: 'inherit', windowsHide: true },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    exitCode = result.status ?? 1
  }
}

for (const file of files) {
  if (batch.length > 0 && batchCharacters + file.length + 1 > maxArgumentCharacters) {
    runBatch()
    batch = []
    batchCharacters = 0
  }

  batch.push(file)
  batchCharacters += file.length + 1
}

runBatch()
process.exit(exitCode)
