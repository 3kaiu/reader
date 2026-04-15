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

function stableHash32(str: string, seed = 0): string {
  // Deterministic, fast, dependency-free 32-bit hash.
  // (Not cryptographic; only used for KV key derivation.)
  let h32 = seed + 0x9e3779b9
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h32 = Math.imul(h32 ^ c, 0x85ebca6b)
    h32 = (h32 << 13) | (h32 >>> 19)
    h32 = Math.imul(h32, 5) + 0x9e3779b9
  }
  return Math.abs(h32).toString(36)
}

export function generateCacheKey(path: string, params?: JsonObject): string {
  const keyData = `cache:${path}:${JSON.stringify(params || {})}`
  const hash = stableHash32(keyData)
  // Cloudflare KV key max is 512 bytes.
  return `c:${hash}`.substring(0, 512)
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
