import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const serviceRoot = path.join(root, 'cf-bypass-service')

const legacyModules = [
  'core/__init__.py',
  'core/config_manager.py',
  'core/domain.py',
  'core/interfaces.py',
  'core/middleware.py',
  'core/ml_engine.py',
]

const runtimeAllowlist = [
  'main.py',
  'app.py',
  'config.py',
  'core/engine.py',
  'core/engine_factory.py',
  'core/errors.py',
  'core/utils.py',
]

function walkPyFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkPyFiles(abs))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.py')) {
      results.push(abs)
    }
  }
  return results
}

function toModule(relPath) {
  return relPath.replace(/\.py$/, '').replace(/\//g, '.')
}

const legacyModulesSet = new Set(legacyModules)
const runtimeAllowlistSet = new Set(runtimeAllowlist)
const pyFiles = walkPyFiles(serviceRoot)
const violations = []

for (const abs of pyFiles) {
  const rel = path.relative(serviceRoot, abs)
  if (legacyModulesSet.has(rel)) continue

  const source = fs.readFileSync(abs, 'utf8')

  for (const legacyPath of legacyModules) {
    const mod = toModule(legacyPath)
    const escaped = mod.replace(/\./g, '\\.')
    const directImport = new RegExp(`\\bimport\\s+${escaped}\\b`)
    const fromImport = new RegExp(`\\bfrom\\s+${escaped}\\s+import\\b`)

    if (directImport.test(source) || fromImport.test(source)) {
      violations.push(`${rel} imports legacy module ${legacyPath}`)
    }
  }

  if (rel.startsWith('core/') && !runtimeAllowlistSet.has(rel) && !legacyModulesSet.has(rel)) {
    violations.push(`${rel} exists in core/ but is not classified in runtime allowlist or legacy list`)
  }
}

if (violations.length > 0) {
  console.error('CF bypass runtime boundary check failed:')
  for (const item of violations) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log('CF bypass runtime boundary check passed.')
