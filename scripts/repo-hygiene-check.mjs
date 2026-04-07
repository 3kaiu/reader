import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const issues = []
const warnings = []

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

function checkTrackedGeneratedArtifacts(files) {
  const patterns = [
    /(^|\/)node_modules\//,
    /(^|\/)target\//,
    /(^|\/)dist\//,
    /(^|\/)coverage\//,
    /\.db$/,
    /browsers\.json$/,
  ]

  const matched = files.filter(file => patterns.some(pattern => pattern.test(file)))
  if (matched.length > 0) {
    warnings.push(
      `Tracked generated/binary-like artifacts (review if intentional): ${matched.join(', ')}`
    )
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
checkTrackedEmptyFiles(trackedFiles)
checkPyprojectReadmes(trackedFiles)
checkTrackedGeneratedArtifacts(trackedFiles)

printSection('Warnings', warnings)
printSection('Issues', issues)

if (issues.length > 0) {
  process.exit(1)
}

console.log('Repository hygiene check passed.')
