import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { load as loadYaml } from 'js-yaml'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const catalogRelativePath = 'Office/tests/test-catalog.json'

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readText(filePath))
  } catch (error) {
    throw new Error(
      label + ' is not valid JSON: ' + (error instanceof Error ? error.message : String(error)),
    )
  }
}

function resolveLocalReference(rootSchema, reference) {
  if (!reference.startsWith('#/')) {
    throw new Error('Only local JSON Schema references are supported: ' + reference)
  }
  return reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, segment) => current?.[segment], rootSchema)
}

function matchesType(value, type) {
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'null') return value === null
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return typeof value === type
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function validateJsonSchema(
  value,
  schema,
  rootSchema = schema,
  location = '$',
  errors = [],
) {
  if (schema === true) return errors
  if (schema === false) {
    errors.push(location + ' is forbidden by the schema')
    return errors
  }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    errors.push(location + ' uses an invalid schema node')
    return errors
  }
  if (schema.$ref) {
    const resolved = resolveLocalReference(rootSchema, schema.$ref)
    if (!resolved) {
      errors.push(location + ' references missing schema node ' + schema.$ref)
      return errors
    }
    return validateJsonSchema(value, resolved, rootSchema, location, errors)
  }

  const acceptedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (acceptedTypes.length > 0 && !acceptedTypes.some((type) => matchesType(value, type))) {
    errors.push(location + ' must be of type ' + acceptedTypes.join(' or '))
    return errors
  }
  if (Object.hasOwn(schema, 'const') && !equalJson(value, schema.const)) {
    errors.push(location + ' must equal ' + JSON.stringify(schema.const))
  }
  if (schema.enum && !schema.enum.some((candidate) => equalJson(value, candidate))) {
    errors.push(location + ' must be one of ' + schema.enum.map(JSON.stringify).join(', '))
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(location + ' must contain at least ' + schema.minLength + ' character(s)')
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(location + ' must match pattern ' + schema.pattern)
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(location + ' must be at least ' + schema.minimum)
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(location + ' must contain at least ' + schema.minItems + ' item(s)')
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item))
      if (new Set(serialized).size !== serialized.length) {
        errors.push(location + ' must contain unique items')
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateJsonSchema(item, schema.items, rootSchema, location + '[' + index + ']', errors),
      )
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(location + ' is missing required property ' + JSON.stringify(required))
      }
    }
    for (const [key, childValue] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, key)) {
        validateJsonSchema(
          childValue,
          schema.properties[key],
          rootSchema,
          location + '.' + key,
          errors,
        )
      } else if (schema.additionalProperties === false) {
        errors.push(location + ' contains unexpected property ' + JSON.stringify(key))
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateJsonSchema(
          childValue,
          schema.additionalProperties,
          rootSchema,
          location + '.' + key,
          errors,
        )
      }
    }
  }
  return errors
}

function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}

export function validateCatalogMappings(catalog, goose) {
  const errors = []
  const suites = Array.isArray(catalog.suites) ? catalog.suites : []
  const commands = Array.isArray(goose?.validationCommands) ? goose.validationCommands : []
  const suiteIds = suites.map((suite) => suite.id)
  const suiteCommandIds = suites.map((suite) => suite.validationCommandId)
  const gooseCommandIds = commands.map((command) => command.id)

  for (const duplicate of duplicateValues(suiteIds)) {
    errors.push('Duplicate catalog suite id: ' + duplicate)
  }
  for (const duplicate of duplicateValues(suiteCommandIds)) {
    errors.push('Duplicate catalog validationCommandId: ' + duplicate)
  }
  for (const duplicate of duplicateValues(gooseCommandIds)) {
    errors.push('Duplicate Goose validation command id: ' + duplicate)
  }

  const suiteIdSet = new Set(suiteIds)
  const suiteCommandSet = new Set(suiteCommandIds)
  const gooseCommandSet = new Set(gooseCommandIds)
  for (const suite of suites) {
    if (suite.id !== suite.validationCommandId) {
      errors.push(
        'Catalog suite ' +
          suite.id +
          ' must map to the same validation command id, not ' +
          suite.validationCommandId,
      )
    }
  }
  for (const commandId of suiteCommandSet) {
    if (!gooseCommandSet.has(commandId)) {
      errors.push('Catalog references missing Goose validation command: ' + commandId)
    }
  }
  for (const commandId of gooseCommandSet) {
    if (!suiteCommandSet.has(commandId)) {
      errors.push('Goose validation command has no catalog suite: ' + commandId)
    }
  }
  for (const quickSuiteId of catalog.defaultQuickSuiteIds ?? []) {
    if (!suiteIdSet.has(quickSuiteId)) {
      errors.push('defaultQuickSuiteIds references missing suite: ' + quickSuiteId)
    }
  }

  if (errors.length > 0) {
    throw new Error('Catalog and Goose command mapping failed:\n- ' + errors.join('\n- '))
  }
}

function loadProjectDocuments(projectRoot) {
  const catalogPath = path.join(projectRoot, ...catalogRelativePath.split('/'))
  const catalog = readJson(catalogPath, 'Test catalog')
  if (typeof catalog.$schema !== 'string' || catalog.$schema.length === 0) {
    throw new Error('Test catalog must declare a non-empty $schema path.')
  }
  const schemaPath = path.resolve(path.dirname(catalogPath), catalog.$schema)
  const relativeSchemaPath = path.relative(projectRoot, schemaPath)
  if (relativeSchemaPath.startsWith('..' + path.sep) || path.isAbsolute(relativeSchemaPath)) {
    throw new Error('Test catalog $schema must stay inside the project root.')
  }
  const schema = readJson(schemaPath, 'Test catalog schema')
  const goosePath = path.join(projectRoot, 'Office', 'goose.yaml')
  let goose
  try {
    goose = loadYaml(readText(goosePath))
  } catch (error) {
    throw new Error(
      'Office/goose.yaml is not valid YAML: ' +
        (error instanceof Error ? error.message : String(error)),
    )
  }
  return { catalog, catalogPath, goose, schema, schemaPath }
}

function runGit(projectRoot, args, encoding = 'utf8') {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding,
    windowsHide: true,
  })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error('git ' + args.join(' ') + ' failed' + (detail ? ': ' + detail : '.'))
  }
  return result.stdout
}

function updateFramed(hash, bytes) {
  hash.update(String(bytes.length))
  hash.update(':')
  hash.update(bytes)
}

function currentGitContentIdentities(root, relativePaths) {
  if (relativePaths.length === 0) return []
  const unsupportedPath = relativePaths.find((entry) => /[\r\n]/.test(entry))
  if (unsupportedPath) {
    throw new Error('Cannot deterministically hash a path containing a newline.')
  }
  const result = spawnSync('git', ['hash-object', '--stdin-paths'], {
    cwd: root,
    encoding: 'utf8',
    input: relativePaths.join('\n') + '\n',
    windowsHide: true,
  })
  if (result.status === 0) {
    const identities = result.stdout.trimEnd().split(/\r?\n/)
    if (identities.length === relativePaths.length) return identities
    throw new Error(
      'Git returned ' +
        identities.length +
        ' content identities for ' +
        relativePaths.length +
        ' paths.',
    )
  }
  const detail = String(result.stderr || result.stdout || '').trim()
  throw new Error('Unable to hash current Git-filtered content' + (detail ? ': ' + detail : '.'))
}

export function computeCatalogProvenance(projectRoot = repositoryRoot) {
  const root = path.resolve(projectRoot)
  const listed = runGit(root, ['ls-files', '-co', '--exclude-standard', '-z'], null)
  const paths = [
    ...new Set(
      listed
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map((entry) => entry.replaceAll('\\', '/'))
        .filter((entry) => entry.toLowerCase() !== catalogRelativePath.toLowerCase())
        .filter((entry) => {
          try {
            fs.lstatSync(path.join(root, ...entry.split('/')))
            return true
          } catch (error) {
            if (error && typeof error === 'object' && error.code === 'ENOENT') return false
            throw error
          }
        }),
    ),
  ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))

  const identities = currentGitContentIdentities(root, paths)
  const hash = crypto.createHash('sha256')
  for (const [index, relativePath] of paths.entries()) {
    updateFramed(hash, Buffer.from(relativePath, 'utf8'))
    updateFramed(hash, Buffer.from(identities[index], 'utf8'))
  }

  return {
    headCommit: String(runGit(root, ['rev-parse', '--short=12', 'HEAD'])).trim(),
    worktreeHash: hash.digest('hex'),
  }
}

function readGitHeadState(projectRoot) {
  const headCommit = String(runGit(projectRoot, ['rev-parse', '--short=12', 'HEAD'])).trim()
  if (!headCommit) {
    throw new Error('Unable to resolve the current Git HEAD for test catalog provenance.')
  }
  const worktreeStatus = String(
    runGit(projectRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  )
  return {
    headCommit,
    isClean: worktreeStatus.trim().length === 0,
  }
}

export function validateSnapshotHead(snapshotHead, gitState) {
  if (gitState.isClean || snapshotHead === gitState.headCommit) return
  throw new Error(
    'Test catalog sourceSnapshot.headCommit is stale in a dirty worktree: expected current HEAD ' +
      gitState.headCommit +
      ', found ' +
      snapshotHead +
      '.',
  )
}

export function checkTestCatalog(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? repositoryRoot)
  const { catalog, goose, schema } = loadProjectDocuments(projectRoot)
  const schemaErrors = validateJsonSchema(catalog, schema)
  if (schemaErrors.length > 0) {
    throw new Error('Test catalog schema validation failed:\n- ' + schemaErrors.join('\n- '))
  }
  validateCatalogMappings(catalog, goose)

  let provenance
  if (!options.skipProvenance) {
    provenance = computeCatalogProvenance(projectRoot)
    validateSnapshotHead(catalog.sourceSnapshot.headCommit, readGitHeadState(projectRoot))
    if (catalog.sourceSnapshot.worktreeHash !== provenance.worktreeHash) {
      throw new Error(
        'Test catalog sourceSnapshot.worktreeHash is stale: expected ' +
          provenance.worktreeHash +
          ', found ' +
          catalog.sourceSnapshot.worktreeHash +
          '.',
      )
    }
  }
  return { provenance, suiteCount: catalog.suites.length }
}

function parseArguments(args) {
  const options = {
    printProvenance: false,
    projectRoot: repositoryRoot,
    skipProvenance: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--skip-provenance') {
      options.skipProvenance = true
    } else if (argument === '--print-provenance') {
      options.printProvenance = true
      options.skipProvenance = true
    } else if (argument === '--project-root') {
      const value = args[index + 1]
      if (!value) throw new Error('--project-root requires a directory path.')
      options.projectRoot = path.resolve(value)
      index += 1
    } else {
      throw new Error('Unknown argument: ' + argument)
    }
  }
  return options
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2))
    const result = checkTestCatalog(options)
    if (options.printProvenance) {
      process.stdout.write(
        JSON.stringify(computeCatalogProvenance(options.projectRoot), null, 2) + '\n',
      )
    } else {
      process.stdout.write(
        '[PASS] Test catalog schema and ' +
          result.suiteCount +
          ' Goose command mappings are valid' +
          (options.skipProvenance ? ' (provenance skipped).' : ' with current provenance.') +
          '\n',
      )
    }
  } catch (error) {
    process.stderr.write(
      '[FAIL] ' + (error instanceof Error ? error.message : String(error)) + '\n',
    )
    process.exitCode = 1
  }
}
