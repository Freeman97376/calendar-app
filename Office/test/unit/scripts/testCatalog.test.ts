import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { load as loadYaml } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkTestCatalog,
  computeCatalogProvenance,
  validateCatalogMappings,
  validateJsonSchema,
  validateSnapshotHead,
} from '../../../../scripts/check-test-catalog.mjs'

const root = process.cwd()
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, 'Office', 'tests', 'test-catalog.json'), 'utf8'),
)
const schema = JSON.parse(
  fs.readFileSync(path.join(root, 'Office', 'schemas', 'test-catalog-v1.schema.json'), 'utf8'),
)
const goose = loadYaml(fs.readFileSync(path.join(root, 'Office', 'goose.yaml'), 'utf8'))
const validationWorkflow = loadYaml(
  fs.readFileSync(path.join(root, '.github', 'workflows', 'validate.yml'), 'utf8'),
) as {
  jobs: {
    'full-gates': {
      steps: Array<{
        uses?: string
        with?: Record<string, unknown>
      }>
    }
  }
}
const temporaryRoots: string[] = []

function runGit(projectRoot: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Git fixture command failed.')
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n')
}

function createCleanCatalogFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-catalog-provenance-'))
  temporaryRoots.push(fixtureRoot)
  const files = [
    'Office/goose.yaml',
    'Office/schemas/test-catalog-v1.schema.json',
    'Office/tests/test-catalog.json',
  ]
  for (const relativePath of files) {
    const source = path.join(root, ...relativePath.split('/'))
    const destination = path.join(fixtureRoot, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }

  runGit(fixtureRoot, ['init', '--quiet'])
  runGit(fixtureRoot, ['config', 'user.email', 'catalog-test@example.invalid'])
  runGit(fixtureRoot, ['config', 'user.name', 'Catalog Test'])
  runGit(fixtureRoot, ['add', '--all'])
  runGit(fixtureRoot, ['commit', '--quiet', '-m', 'fixture seed'])

  const catalogPath = path.join(fixtureRoot, 'Office', 'tests', 'test-catalog.json')
  const fixtureCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  fixtureCatalog.sourceSnapshot = {
    headCommit: 'deadbeefdead',
    worktreeHash: computeCatalogProvenance(fixtureRoot).worktreeHash,
  }
  writeJson(catalogPath, fixtureCatalog)
  runGit(fixtureRoot, ['add', '--all'])
  runGit(fixtureRoot, ['commit', '--quiet', '-m', 'record generated catalog'])

  return { catalogPath, fixtureRoot }
}

afterEach(() => {
  for (const temporaryRoot of temporaryRoots.splice(0)) {
    fs.rmSync(temporaryRoot, { force: true, recursive: true })
  }
})

describe('test catalog governance', () => {
  it('validates the current schema and Goose command mapping without provenance', () => {
    expect(checkTestCatalog({ projectRoot: root, skipProvenance: true }).suiteCount).toBe(17)
  })

  it('checks out the pull request head instead of a synthetic merge tree', () => {
    const checkout = validationWorkflow.jobs['full-gates'].steps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    )

    expect(checkout?.with).toMatchObject({
      'fetch-depth': 2,
      ref: "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
    })
  })

  it('rejects schema version and unexpected-property drift', () => {
    const changed = structuredClone(catalog)
    changed.schemaVersion = 2
    changed.unexpected = true

    const errors = validateJsonSchema(changed, schema)
    expect(errors.join('\n')).toContain('$.schemaVersion')
    expect(errors.join('\n')).toContain('unexpected property')
  })

  it('rejects catalog-to-Goose command drift', () => {
    const changed = structuredClone(catalog)
    changed.suites[0].validationCommandId = 'missing-command'

    expect(() => validateCatalogMappings(changed, goose)).toThrow(
      'Catalog and Goose command mapping failed',
    )
  })

  it('computes the current short HEAD and a SHA-256 worktree hash', () => {
    const provenance = computeCatalogProvenance(root)

    expect(provenance.headCommit).toMatch(/^[0-9a-f]{12}$/)
    expect(provenance.worktreeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts the current HEAD for clean and dirty worktrees', () => {
    for (const isClean of [true, false]) {
      expect(() =>
        validateSnapshotHead('111111111111', {
          headCommit: '111111111111',
          isClean,
        }),
      ).not.toThrow()
    }
  })

  it('allows any recorded generation-base head in a clean checkout', () => {
    const cleanState = {
      headCommit: '111111111111',
      isClean: true,
    }

    expect(() => validateSnapshotHead('222222222222', cleanState)).not.toThrow()
    expect(() => validateSnapshotHead('333333333333', cleanState)).not.toThrow()
    expect(() => validateSnapshotHead('deadbeefdead', cleanState)).not.toThrow()
  })

  it('rejects an old generation-base head in a dirty worktree', () => {
    const dirtyState = {
      headCommit: '111111111111',
      isClean: false,
    }

    expect(() => validateSnapshotHead('222222222222', dirtyState)).toThrow(
      'stale in a dirty worktree',
    )
  })

  it('allows clean informational head provenance but rejects hash drift in the full check', () => {
    const { catalogPath, fixtureRoot } = createCleanCatalogFixture()

    expect(() => checkTestCatalog({ projectRoot: fixtureRoot })).not.toThrow()

    const changedCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    changedCatalog.sourceSnapshot.worktreeHash = '0'.repeat(64)
    writeJson(catalogPath, changedCatalog)
    runGit(fixtureRoot, ['add', '--all'])
    runGit(fixtureRoot, ['commit', '--quiet', '-m', 'introduce stale hash'])

    expect(() => checkTestCatalog({ projectRoot: fixtureRoot })).toThrow(
      'sourceSnapshot.worktreeHash is stale',
    )
  })
})
