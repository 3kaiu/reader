import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

const contractPath = path.join(rootDir, 'contracts', 'http-routes.json')
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function extractStringArray(source, constName) {
  const matcher = new RegExp(`const\\s+${constName}\\s*=\\s*\\[(.*?)\\]`, 's')
  const match = source.match(matcher)
  if (!match) {
    throw new Error(`Unable to find array constant ${constName}`)
  }

  const values = []
  const itemMatcher = /['"]([^'"]+)['"]/g
  let item = itemMatcher.exec(match[1])
  while (item) {
    values.push(item[1])
    item = itemMatcher.exec(match[1])
  }
  return values
}

function extractTypeUnionMembers(source, typeName) {
  const matcher = new RegExp(`^\\s*export\\s+type\\s+${typeName}\\s*=\\s*([^\\n]+)$`, 'm')
  const match = source.match(matcher)
  if (!match) {
    throw new Error(`Unable to find type alias ${typeName}`)
  }

  const values = []
  const itemMatcher = /['"]([^'"]+)['"]/g
  let item = itemMatcher.exec(match[1])
  while (item) {
    values.push(item[1])
    item = itemMatcher.exec(match[1])
  }
  return values
}

function extractBraceBlock(source, startIndex) {
  let depth = 0
  for (let index = startIndex; index < source.length; index++) {
    const char = source[index]
    if (char === '{') {
      depth++
      continue
    }
    if (char === '}') {
      depth--
      if (depth === 0) {
        return source.slice(startIndex + 1, index)
      }
    }
  }
  throw new Error(`Unable to extract brace block starting at index ${startIndex}`)
}

function extractInterfaceFields(source, interfaceName) {
  const matcher = new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{`)
  const match = matcher.exec(source)
  if (!match) {
    throw new Error(`Unable to find interface ${interfaceName}`)
  }

  const blockStart = source.indexOf('{', match.index)
  const block = extractBraceBlock(source, blockStart)
  const fields = []
  let nestedDepth = 0

  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    if (nestedDepth === 0) {
      const fieldMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:/)
      if (fieldMatch) {
        fields.push(`${fieldMatch[1]}${fieldMatch[2] || ''}`)
      }
    }

    nestedDepth += (trimmed.match(/\{/g) || []).length
    nestedDepth -= (trimmed.match(/\}/g) || []).length
  }

  return fields
}

function extractTomlCsvVar(source, key) {
  const matcher = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm')
  const match = source.match(matcher)
  if (!match) {
    throw new Error(`Unable to find TOML var ${key}`)
  }

  return match[1]
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function extractRustRoutes(source) {
  const routes = new Set()
  const matcher = /\.route\(\s*"([^"]+)"/g
  let match = matcher.exec(source)
  while (match) {
    routes.add(match[1])
    match = matcher.exec(source)
  }
  return [...routes]
}

function compareExact(label, actual, expected, errors) {
  const sameLength = actual.length === expected.length
  const sameItems = actual.every((item, index) => item === expected[index])
  if (sameLength && sameItems) {
    return
  }

  errors.push(
    `${label} mismatch\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`
  )
}

function compareContains(label, actual, expectedSubset, errors) {
  const actualSet = new Set(actual)
  const missing = expectedSubset.filter(item => !actualSet.has(item))
  if (missing.length === 0) {
    return
  }

  errors.push(`${label} missing routes: ${JSON.stringify(missing)}`)
}

const files = {
  routePolicy: path.join(rootDir, 'nexus-reader', 'src', 'api', 'route-policy.ts'),
  edgeGateway: path.join(rootDir, 'cloudflare-workers', 'worker', 'edge-gateway.ts'),
  entryAdapter: path.join(rootDir, 'cloudflare-workers', 'src', 'entry-adapter.ts'),
  wrangler: path.join(rootDir, 'cloudflare-workers', 'wrangler.toml'),
  backendApp: path.join(rootDir, 'nexus-lite', 'nexus-server', 'src', 'app.rs'),
  frontendDecoderTypes: path.join(rootDir, 'nexus-reader', 'src', 'types', 'decoder.ts'),
  workerDecoderTypes: path.join(rootDir, 'cloudflare-workers', 'shared', 'types.ts'),
}

const errors = []

const routePolicySource = read(files.routePolicy)
compareExact(
  'frontend EDGE_ONLY_RULES',
  extractStringArray(routePolicySource, 'EDGE_ONLY_RULES'),
  contract.frontend.edgeOnlyPrefixes,
  errors
)
compareExact(
  'frontend DIRECT_RULES',
  extractStringArray(routePolicySource, 'DIRECT_RULES'),
  contract.frontend.directEligiblePrefixes,
  errors
)

const edgeGatewaySource = read(files.edgeGateway)
compareExact(
  'worker USER_SERVICE_PREFIXES',
  extractStringArray(edgeGatewaySource, 'USER_SERVICE_PREFIXES'),
  contract.worker.userServicePrefixes,
  errors
)

const entryAdapterSource = read(files.entryAdapter)
compareExact(
  'worker DEFAULT_ROUTES',
  extractStringArray(entryAdapterSource, 'DEFAULT_ROUTES'),
  contract.worker.experimentalRoutes,
  errors
)

const wranglerSource = read(files.wrangler)
compareExact(
  'wrangler EDGE_EXPERIMENTAL_ROUTES',
  extractTomlCsvVar(wranglerSource, 'EDGE_EXPERIMENTAL_ROUTES'),
  contract.worker.experimentalRoutes,
  errors
)
compareExact(
  'wrangler EDGE_EXPERIMENTAL_EXCLUDE_ROUTES',
  extractTomlCsvVar(wranglerSource, 'EDGE_EXPERIMENTAL_EXCLUDE_ROUTES'),
  contract.worker.experimentalExcludeRoutes,
  errors
)

const backendRoutes = extractRustRoutes(read(files.backendApp))
compareContains('backend app routes', backendRoutes, contract.backend.requiredRoutes, errors)

const frontendDecoderTypesSource = read(files.frontendDecoderTypes)
const workerDecoderTypesSource = read(files.workerDecoderTypes)

compareExact(
  'decoder type DecodeSource',
  extractTypeUnionMembers(workerDecoderTypesSource, 'DecodeSource'),
  extractTypeUnionMembers(frontendDecoderTypesSource, 'DecodeSource'),
  errors
)

for (const interfaceName of [
  'Candidate',
  'DecodedEntity',
  'ChapterContext',
  'DictionaryEntry',
  'DecodeRequest',
  'DecodeResponse',
]) {
  compareExact(
    `decoder interface ${interfaceName}`,
    extractInterfaceFields(workerDecoderTypesSource, interfaceName),
    extractInterfaceFields(frontendDecoderTypesSource, interfaceName),
    errors
  )
}

if (errors.length > 0) {
  console.error('Route contract validation failed:\n')
  for (const error of errors) {
    console.error(`- ${error}\n`)
  }
  process.exit(1)
}

console.log('Route contract validation passed.')
