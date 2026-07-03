/**
 * Replace YOUR_*_HERE placeholders in edge/wrangler.toml from env vars.
 * Used by deploy-personal CI. Only substitutes when the env var is non-empty.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

const pairs = [
  ['YOUR_CONTENT_CACHE_KV_ID_HERE', 'CF_CONTENT_CACHE_KV_ID'],
  ['YOUR_NEXUS_API_URL_HERE', 'NEXUS_API_URL'],
]

const wranglerPath = path.resolve(process.argv[2] || path.join(rootDir, 'edge', 'wrangler.toml'))

let text = fs.readFileSync(wranglerPath, 'utf8')
for (const [placeholder, envKey] of pairs) {
  const value = process.env[envKey]
  if (value) text = text.split(placeholder).join(value)
}
fs.writeFileSync(wranglerPath, text, 'utf8')
console.log('Applied wrangler placeholders from env:', wranglerPath)
