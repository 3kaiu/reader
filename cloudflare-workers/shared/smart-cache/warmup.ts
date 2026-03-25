import { getFromCache } from '../cache.ts'
import type { KVNamespaceFallback } from '../types.ts'

export async function processKeyBatches(
  keys: string[],
  batchSize: number,
  processor: (key: string) => Promise<void>
): Promise<void> {
  for (let index = 0; index < keys.length; index += batchSize) {
    const batch = keys.slice(index, index + batchSize)
    await Promise.all(batch.map(key => processor(key)))
  }
}

export async function hasCachedKey(
  kv: KVNamespaceFallback,
  cacheKey: string
): Promise<boolean> {
  try {
    const existing = await getFromCache(kv, cacheKey)
    return Boolean(existing)
  } catch {
    return false
  }
}
