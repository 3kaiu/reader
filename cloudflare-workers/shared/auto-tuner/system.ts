import { SMART_CACHE_CONFIGS } from '../smart-cache.ts'
import type { MutableDecodeCacheConfig } from './types.ts'

export async function applyParameterToSystem(parameter: string, value: number): Promise<void> {
  const decodeCacheConfig = SMART_CACHE_CONFIGS.DECODE_RESULTS as MutableDecodeCacheConfig

  switch (parameter) {
    case 'cache.ttl':
      decodeCacheConfig.ttl = value
      break
    case 'cache.hitRateThreshold':
      decodeCacheConfig.hitRateThreshold = value
      break
    case 'ai.maxCallsPerMinute':
      break
    case 'dict.maxGlobalEntries':
      break
    default:
      console.warn(`Unknown parameter: ${parameter}`)
  }
}
