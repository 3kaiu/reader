import type { SmartCacheConfig } from './types.ts'

export const SMART_CACHE_CONFIGS = {
  DECODE_RESULTS: {
    ttl: 3600,
    maxAge: 604800,
    prewarmEnabled: true,
    hitRateThreshold: 0.8,
    adaptiveTTL: false,
  },
  SEARCH_RESULTS: {
    ttl: 1800,
    maxAge: 3600,
    prewarmEnabled: false,
    hitRateThreshold: 0.5,
    adaptiveTTL: true,
  },
} as const satisfies Record<string, SmartCacheConfig>
