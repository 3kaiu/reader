/**
 * KV cache utilities (minimal).
 *
 * The edge worker only needs deterministic keys plus JSON payload get/put.
 * Keep this module small: anything not referenced by `shared/proxy.ts` should
 * not live here.
 */

import type { JsonObject, KVNamespaceLike } from './types.ts'

type CachedPayload = {
  body: string
  contentType?: string
  cachedAt?: string
}

function stableHash64(str: string, seed = 0): string {
  // Deterministic, fast, dependency-free 64-bit hash.
  // Uses two independent 32-bit hashes to avoid birthday paradox at ~77k entries.
  // NOTE: This is NOT collision-resistant against deliberate attacks.
  // For cache key generation on a single-tenant edge worker this is acceptable
  // because the key space is small (<10k entries). If attack resistance is needed,
  // replace with crypto.subtle.digest('SHA-256', ...) and pass the async result.
  let h1 = seed + 0x9e3779b9
  let h2 = seed + 0x517cc1b7
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x85ebca6b)
    h1 = (h1 << 13) | (h1 >>> 19)
    h1 = Math.imul(h1, 5) + 0x9e3779b9
    h2 = Math.imul(h2 ^ c, 0x517cc1b7)
    h2 = (h2 << 17) | (h2 >>> 15)
    h2 = Math.imul(h2, 7) + 0x517cc1b7
  }
  return (Math.abs(h1).toString(36) + Math.abs(h2).toString(36)).substring(0, 16)
}

export function generateCacheKey(path: string, params?: JsonObject): string {
  const keyData = `cache:${path}:${JSON.stringify(params || {})}`
  // Use 64-bit hash to avoid birthday paradox collision at ~77k entries
  const hash = stableHash64(keyData)
  // Cloudflare KV key max is 512 bytes.
  return `c:${hash}`
}

export async function getFromCache(
  kv: KVNamespaceLike | undefined,
  key: string
): Promise<{ body: string; contentType: string; cachedAt?: string } | null> {
  if (!kv) return null
  try {
    const data = await kv.get<CachedPayload>(key, { type: 'json' })
    if (!data) return null
    return {
      body: data.body,
      contentType: data.contentType || 'application/json',
      cachedAt: data.cachedAt,
    }
  } catch (e) {
    console.warn('KV get error:', e)
    return null
  }
}

export async function saveToCache(
  kv: KVNamespaceLike | undefined,
  key: string,
  body: string,
  contentType: string,
  ttlSeconds: number
): Promise<void> {
  if (!kv) return
  try {
    await kv.put(
      key,
      JSON.stringify({
        body,
        contentType,
        cachedAt: new Date().toISOString(),
      } satisfies CachedPayload),
      { expirationTtl: ttlSeconds }
    )
  } catch (e) {
    console.warn('KV put error:', e)
  }
}
