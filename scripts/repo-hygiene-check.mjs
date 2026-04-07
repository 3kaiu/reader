import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const issues = []
const warnings = []
const allowlistPath = path.join(root, 'scripts', 'hygiene-allowlist.json')

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    return { trackedGeneratedArtifacts: {} }
  }

  try {
    const raw = fs.readFileSync(allowlistPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      trackedGeneratedArtifacts: parsed.trackedGeneratedArtifacts || {},
    }
  } catch (error) {
    issues.push(`Failed to parse hygiene allowlist: ${allowlistPath}`)
    return { trackedGeneratedArtifacts: {} }
  }
}

function getTrackedFiles() {
  const raw = execSync('git ls-files', { encoding: 'utf8' })
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function checkTrackedEmptyFiles(files) {
  const empty = files.filter(file => {
    try {
      const stat = fs.statSync(path.join(root, file))
      return stat.isFile() && stat.size === 0
    } catch {
      return false
    }
  })

  if (empty.length > 0) {
    issues.push(`Tracked empty files found: ${empty.join(', ')}`)
  }
}

function checkPyprojectReadmes(files) {
  const pyprojects = files.filter(file => file.endsWith('pyproject.toml'))

  for (const pyproject of pyprojects) {
    const abs = path.join(root, pyproject)
    const source = fs.readFileSync(abs, 'utf8')
    const match = source.match(/^readme\s*=\s*"([^"]+)"/m)
    if (!match) continue

    const readmePath = path.join(path.dirname(abs), match[1])
    if (!fs.existsSync(readmePath)) {
      issues.push(`${pyproject} declares missing readme: ${match[1]}`)
    }
  }
}

function checkTrackedGeneratedArtifacts(files, allowlist) {
  const patterns = [
    /(^|\/)node_modules\//,
    /(^|\/)target\//,
    /(^|\/)dist\//,
    /(^|\/)coverage\//,
    /\.db$/,
    /browsers\.json$/,
  ]

  const matched = files.filter(file => patterns.some(pattern => pattern.test(file)))
  if (matched.length === 0) return

  const allowlisted = allowlist.trackedGeneratedArtifacts || {}
  const unknown = []

  for (const file of matched) {
    const reason = allowlisted[file]
    if (!reason) {
      unknown.push(file)
      continue
    }
    warnings.push(`Allowlisted artifact: ${file} (${reason})`)
  }

  if (unknown.length > 0) {
    issues.push(
      `Tracked generated/binary-like artifacts must be allowlisted in scripts/hygiene-allowlist.json: ${unknown.join(', ')}`
    )
  }
}

function checkDocsIndexCoverage(files) {
  const docsIndex = path.join(root, 'DOCS_INDEX.md')
  if (!fs.existsSync(docsIndex)) {
    issues.push('Missing DOCS_INDEX.md (canonical docs entrypoint)')
    return
  }

  const indexSource = fs.readFileSync(docsIndex, 'utf8')
  const links = new Set()
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g
  let match = linkPattern.exec(indexSource)
  while (match) {
    const raw = match[1].trim()
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      links.add(raw.replace(/^\.\//, ''))
    }
    match = linkPattern.exec(indexSource)
  }

  const trackedMarkdown = files.filter(file => file.endsWith('.md'))
  const excluded = new Set(['AGENTS.md', 'DOCS_INDEX.md'])
  const missing = trackedMarkdown.filter(file => !excluded.has(file) && !links.has(file))
  if (missing.length > 0) {
    issues.push(`Tracked markdown files missing from DOCS_INDEX.md: ${missing.join(', ')}`)
  }
}

function printSection(title, rows) {
  if (rows.length === 0) return
  console.log(`\n${title}`)
  for (const row of rows) {
    console.log(`- ${row}`)
  }
}

const trackedFiles = getTrackedFiles()
const allowlist = loadAllowlist()
checkTrackedEmptyFiles(trackedFiles)
checkPyprojectReadmes(trackedFiles)
checkTrackedGeneratedArtifacts(trackedFiles, allowlist)
checkDocsIndexCoverage(trackedFiles)

printSection('Warnings', warnings)
printSection('Issues', issues)

if (issues.length > 0) {
  process.exit(1)
}

console.log('Repository hygiene check passed.')
