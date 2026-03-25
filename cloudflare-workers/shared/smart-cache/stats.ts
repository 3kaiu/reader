import type {
  SmartCacheAccessStat,
  SmartCacheConfig,
  SmartCacheStats,
} from './types.ts'

type CleanupStatsOptions = {
  maxStatsSize: number
  statsCleanupInterval: number
  lastCleanup: number
}

export function recordCacheHit(
  accessStats: Map<string, SmartCacheAccessStat>,
  cacheKey: string,
  fallbackTtl: number,
  now = Date.now()
): void {
  const stats = ensureAccessStat(accessStats, cacheKey, fallbackTtl, now)
  stats.hits += 1
  accessStats.set(cacheKey, stats)
}

export function recordCacheMiss(
  accessStats: Map<string, SmartCacheAccessStat>,
  cacheKey: string,
  fallbackTtl: number,
  now = Date.now()
): void {
  const stats = ensureAccessStat(accessStats, cacheKey, fallbackTtl, now)
  stats.misses += 1
  accessStats.set(cacheKey, stats)
}

export function recordCacheWrite(
  accessStats: Map<string, SmartCacheAccessStat>,
  cacheKey: string,
  ttl: number,
  now = Date.now()
): void {
  const stats = ensureAccessStat(accessStats, cacheKey, ttl, now)
  stats.ttl = ttl
  stats.lastAccess = now
  accessStats.set(cacheKey, stats)
}

export function getAdaptiveTTL(
  config: SmartCacheConfig,
  stats: SmartCacheAccessStat | undefined,
  baseTTL: number
): number {
  if (!config.adaptiveTTL) {
    return baseTTL
  }

  if (!stats || stats.hits + stats.misses < 10) {
    return baseTTL
  }

  const hitRate = stats.hits / (stats.hits + stats.misses)

  if (hitRate > config.hitRateThreshold) {
    return Math.min(config.maxAge, stats.ttl * 2)
  }

  if (hitRate < 0.1) {
    return Math.max(60, Math.floor(stats.ttl / 2))
  }

  return stats.ttl
}

export function cleanupStatsIfNeeded(
  accessStats: Map<string, SmartCacheAccessStat>,
  options: CleanupStatsOptions,
  now = Date.now()
): { removedCount: number; lastCleanup: number } {
  if (now - options.lastCleanup < options.statsCleanupInterval) {
    return {
      removedCount: 0,
      lastCleanup: options.lastCleanup,
    }
  }

  const removedCount =
    accessStats.size > options.maxStatsSize
      ? cleanupOldStats(accessStats)
      : 0

  return {
    removedCount,
    lastCleanup: now,
  }
}

export function collectExpiredCacheKeys(
  accessStats: Map<string, SmartCacheAccessStat>,
  maxAgeSeconds: number,
  now = Date.now()
): string[] {
  const expiredKeys: string[] = []

  for (const [key, stats] of accessStats) {
    if (now - stats.lastAccess > maxAgeSeconds * 1000) {
      expiredKeys.push(key)
    }
  }

  return expiredKeys
}

export function analyzeHotKeys(
  accessStats: Map<string, SmartCacheAccessStat>,
  maxKeys: number,
  now = Date.now()
): string[] {
  const oneHourAgo = now - 60 * 60 * 1000
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const keyScores: Array<{ key: string; score: number }> = []

  for (const [key, stats] of accessStats.entries()) {
    if (stats.lastAccess < oneDayAgo) {
      continue
    }

    const timeWeight = stats.lastAccess > oneHourAgo ? 2.0 : 1.0
    const hitRate = stats.hits / (stats.hits + stats.misses || 1)
    const score = (stats.hits + stats.misses) * timeWeight * hitRate
    keyScores.push({ key, score })
  }

  return keyScores
    .sort((left, right) => right.score - left.score)
    .slice(0, maxKeys)
    .map(item => item.key)
}

export function summarizeAccessStats(
  accessStats: Map<string, SmartCacheAccessStat>
): SmartCacheStats {
  let totalHits = 0
  let totalMisses = 0

  for (const stats of accessStats.values()) {
    totalHits += stats.hits
    totalMisses += stats.misses
  }

  return {
    size: accessStats.size,
    totalHits,
    totalMisses,
    hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
  }
}

function ensureAccessStat(
  accessStats: Map<string, SmartCacheAccessStat>,
  cacheKey: string,
  fallbackTtl: number,
  now = Date.now()
): SmartCacheAccessStat {
  const existing = accessStats.get(cacheKey)
  if (existing) {
    existing.lastAccess = now
    return existing
  }

  const created: SmartCacheAccessStat = {
    hits: 0,
    misses: 0,
    lastAccess: now,
    ttl: fallbackTtl,
  }
  accessStats.set(cacheKey, created)
  return created
}

function cleanupOldStats(
  accessStats: Map<string, SmartCacheAccessStat>
): number {
  const entries = Array.from(accessStats.entries())
    .sort((left, right) => left[1].lastAccess - right[1].lastAccess)
  const keepCount = Math.max(1, Math.ceil(entries.length * 0.7))
  const retainedEntries = entries.slice(-keepCount)

  accessStats.clear()
  for (const [key, value] of retainedEntries) {
    accessStats.set(key, value)
  }

  return entries.length - retainedEntries.length
}
