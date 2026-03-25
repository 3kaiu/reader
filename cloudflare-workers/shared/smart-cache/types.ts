export interface SmartCacheConfig {
  ttl: number
  maxAge: number
  prewarmEnabled: boolean
  hitRateThreshold: number
  adaptiveTTL: boolean
}

export interface SmartCacheAccessStat {
  hits: number
  misses: number
  lastAccess: number
  ttl: number
}

export interface SmartCacheStats {
  size: number
  totalHits: number
  totalMisses: number
  hitRate: number
}
