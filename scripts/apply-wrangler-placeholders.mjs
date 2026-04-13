/**
 * Replace YOUR_*_HERE placeholders in cloudflare-workers/wrangler.toml from env vars.
 * Used by deploy-personal CI. Only substitutes when the env var is non-empty.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')

const pairs = [
  ['YOUR_ANALYTICS_DB_ID_HERE', 'CF_ANALYTICS_DB_ID'],
  ['YOUR_USER_PREFS_DB_ID_HERE', 'CF_USER_PREFS_DB_ID'],
  ['YOUR_PROGRESS_KV_ID_HERE', 'CF_PROGRESS_KV_ID'],
  ['YOUR_CONTENT_CACHE_KV_ID_HERE', 'CF_CONTENT_CACHE_KV_ID'],
  ['YOUR_DECODER_KV_ID_HERE', 'CF_DECODER_KV_ID'],
  ['YOUR_AI_CACHE_KV_ID_HERE', 'CF_AI_CACHE_KV_ID'],
  ['YOUR_PROD_ANALYTICS_DB_ID_HERE', 'CF_PROD_ANALYTICS_DB_ID'],
  ['YOUR_PROD_USER_PREFS_DB_ID_HERE', 'CF_PROD_USER_PREFS_DB_ID'],
  ['YOUR_PROD_PROGRESS_KV_ID_HERE', 'CF_PROD_PROGRESS_KV_ID'],
]

const wranglerPath = path.resolve(process.argv[2] || path.join(rootDir, 'cloudflare-workers', 'wrangler.toml'))

let text = fs.readFileSync(wranglerPath, 'utf8')
for (const [placeholder, envKey] of pairs) {
  const value = process.env[envKey]
  if (value) text = text.split(placeholder).join(value)
}
fs.writeFileSync(wranglerPath, text, 'utf8')
console.log('Applied wrangler placeholders from env:', wranglerPath)
