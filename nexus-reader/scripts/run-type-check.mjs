import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const binDir = resolve(projectRoot, 'node_modules', '.bin')
const executableSuffix = process.platform === 'win32' ? '.cmd' : ''

const runCommand = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  process.exit(result.status ?? 1)
}

const vueTscPath = resolve(binDir, `vue-tsc${executableSuffix}`)
if (existsSync(vueTscPath)) {
  runCommand(vueTscPath, ['--noEmit'])
}

const tscPath = resolve(binDir, `tsc${executableSuffix}`)
if (existsSync(tscPath)) {
  console.warn('[type-check] vue-tsc is not installed in node_modules; falling back to tsc --noEmit -p tsconfig.json')
  runCommand(tscPath, ['--noEmit', '-p', 'tsconfig.json'])
}

console.error('[type-check] Neither vue-tsc nor tsc is available in node_modules/.bin')
process.exit(1)
