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
  const matcher = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  )
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
  routePolicyConstants: path.join(
    rootDir,
    'web',
    'src',
    'api',
    'route-policy.constants.generated.ts',
  ),
  workerUserServicePrefixes: path.join(
    rootDir,
    'edge',
    'worker',
    'user-service-prefixes.generated.ts',
  ),
  backendApp: path.join(rootDir, 'api', 'nexus-server', 'src', 'app.rs'),
}

const errors = []

const routePolicyConstantsSource = read(files.routePolicyConstants)
const expectedEdgeOnly = [
  ...contract.routing.edgeHandledApiPrefixes,
  ...contract.routing.edgeHandledPathExtras,
]
compareExact(
  'frontend EDGE_ONLY_RULES',
  extractStringArray(routePolicyConstantsSource, 'EDGE_ONLY_RULES'),
  expectedEdgeOnly,
  errors,
)
compareExact(
  'frontend DIRECT_RULES',
  extractStringArray(routePolicyConstantsSource, 'DIRECT_RULES'),
  contract.frontend.directEligiblePrefixes,
  errors,
)

const workerPrefixesSource = read(files.workerUserServicePrefixes)
compareExact(
  'worker USER_SERVICE_PREFIXES',
  extractStringArray(workerPrefixesSource, 'USER_SERVICE_PREFIXES'),
  contract.routing.edgeHandledApiPrefixes,
  errors,
)

const backendRoutes = [
  ...new Set([
    ...extractRustRoutes(read(files.backendApp)),
  ]),
]
compareContains('backend app routes', backendRoutes, contract.backend.requiredRoutes, errors)

if (errors.length > 0) {
  console.error('Route contract validation failed:\n')
  for (const error of errors) {
    console.error(`- ${error}\n`)
  }
  process.exit(1)
}

console.log('Route contract validation passed.')
