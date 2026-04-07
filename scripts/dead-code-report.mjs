import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function gitFiles() {
  return execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

function scanCfBypassPython(files) {
  const pyFiles = files.filter(f => f.startsWith('cf-bypass-service/') && f.endsWith('.py'))
  const relFiles = pyFiles.map(f => f.replace('cf-bypass-service/', ''))
  const fileSet = new Set(relFiles)

  const sourceMap = new Map()
  for (const rel of relFiles) {
    const abs = path.join(root, 'cf-bypass-service', rel)
    sourceMap.set(rel, fs.readFileSync(abs, 'utf8'))
  }

  const inbound = new Map(relFiles.map(f => [f, 0]))

  function resolveImport(mod) {
    const normalized = mod.replace(/\./g, '/')
    const direct = `${normalized}.py`
    const pkg = path.join(normalized, '__init__.py')
    if (fileSet.has(direct)) return direct
    if (fileSet.has(pkg)) return pkg
    return null
  }

  const importRe = /^\s*import\s+([A-Za-z0-9_\.]+)/gm
  const fromRe = /^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/gm

  for (const [src, text] of sourceMap.entries()) {
    for (const re of [importRe, fromRe]) {
      re.lastIndex = 0
      let m = re.exec(text)
      while (m) {
        const target = resolveImport(m[1])
        if (target && target !== src) {
          inbound.set(target, (inbound.get(target) || 0) + 1)
        }
        m = re.exec(text)
      }
    }
  }

  const ignore = new Set([
    'main.py',
    'app.py',
    'core/__init__.py',
    'engines/__init__.py',
    'managers/__init__.py',
  ])

  return relFiles
    .filter(rel => (inbound.get(rel) || 0) === 0 && !ignore.has(rel))
    .sort()
    .map(rel => `cf-bypass-service/${rel}`)
}

function scanMarkdownOrphans(files) {
  const mdFiles = files.filter(f => f.endsWith('.md'))
  const textFiles = files.filter(f => /\.(md|yml|yaml|json|toml|ts|tsx|js|mjs|cjs|py|rs)$/i.test(f))

  const texts = textFiles.map(f => {
    try {
      return fs.readFileSync(path.join(root, f), 'utf8')
    } catch {
      return ''
    }
  })

  const orphans = []
  for (const md of mdFiles) {
    const base = path.basename(md)
    const refs = texts.reduce((acc, t) => acc + (t.includes(base) ? 1 : 0), 0)
    if (refs === 0 && md !== 'AGENTS.md') {
      orphans.push(md)
    }
  }

  return orphans.sort()
}

const files = gitFiles()
const pythonOrphans = scanCfBypassPython(files)
const mdOrphans = scanMarkdownOrphans(files)

console.log('Dead code / orphan report (non-blocking)')

if (pythonOrphans.length === 0) {
  console.log('- CF bypass python: no obvious orphan modules found')
} else {
  console.log('- CF bypass python orphan candidates:')
  for (const item of pythonOrphans) {
    console.log(`  - ${item}`)
  }
}

if (mdOrphans.length === 0) {
  console.log('- Markdown docs: no obvious orphan docs found')
} else {
  console.log('- Markdown orphan candidates:')
  for (const item of mdOrphans) {
    console.log(`  - ${item}`)
  }
}

process.exit(0)
