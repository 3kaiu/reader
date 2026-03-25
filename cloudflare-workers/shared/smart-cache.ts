/**
 * Smart Cache Service (智能缓存服务)
 * 提供多层缓存、智能过期、预热机制
 */

import { generateCacheKey, getFromCache, saveToCache } from './cache.ts'
import {
  deserializeSmartCacheValue,
  serializeSmartCacheValue,
} from './smart-cache/io.ts'
import {
  analyzeHotKeys,
  cleanupStatsIfNeeded,
  collectExpiredCacheKeys,
  getAdaptiveTTL,
  recordCacheHit,
  recordCacheMiss,
  recordCacheWrite,
  summarizeAccessStats,
} from './smart-cache/stats.ts'
import type {
  SmartCacheAccessStat,
  SmartCacheConfig,
} from './smart-cache/types.ts'
import {
  hasCachedKey,
  processKeyBatches,
} from './smart-cache/warmup.ts'
import type { KVNamespaceFallback } from './types.ts'

export { SMART_CACHE_CONFIGS } from './smart-cache/config.ts'
export type {
  SmartCacheConfig,
} from './smart-cache/types.ts'

export class SmartCache {
  private kv: KVNamespaceFallback
  private config: SmartCacheConfig
  private accessStats = new Map<string, SmartCacheAccessStat>()
  private prewarmQueue: string[] = []
  private isPrewarming = false
  private maxStatsSize = 10000
  private statsCleanupInterval = 5 * 60 * 1000
  private lastCleanup = Date.now()

  constructor(kv: KVNamespaceFallback, config: SmartCacheConfig) {
    this.kv = kv
    this.config = config
  }

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = generateCacheKey(key)
    const cleanupResult = cleanupStatsIfNeeded(this.accessStats, {
      maxStatsSize: this.maxStatsSize,
      statsCleanupInterval: this.statsCleanupInterval,
      lastCleanup: this.lastCleanup,
    })
    this.lastCleanup = cleanupResult.lastCleanup
    if (cleanupResult.removedCount > 0) {
      console.log(`Cleaned up ${cleanupResult.removedCount} old cache stats entries`)
    }

    try {
      const cached = await getFromCache(this.kv, cacheKey)
      if (cached) {
        recordCacheHit(this.accessStats, cacheKey, this.config.ttl)
        return deserializeSmartCacheValue<T>(cached.body)
      }
    } catch (error) {
      console.warn('Cache get error:', error)
    }

    recordCacheMiss(this.accessStats, cacheKey, this.config.ttl)
    return null
  }

  async set<T>(key: string, value: T, customTTL?: number, compress = true): Promise<void> {
    const cacheKey = generateCacheKey(key)
    const serializedValue = serializeSmartCacheValue(value)
    const baseTTL = customTTL || this.config.ttl
    const adaptiveTTL = getAdaptiveTTL(
      this.config,
      this.accessStats.get(cacheKey),
      baseTTL
    )

    try {
      await saveToCache(
        this.kv,
        cacheKey,
        serializedValue,
        'application/json',
        adaptiveTTL,
        compress
      )
      recordCacheWrite(this.accessStats, cacheKey, adaptiveTTL)
    } catch (error) {
      console.warn('Cache set error:', error)
    }
  }

  // 批量预热缓存
  async prewarm(keys: string[]): Promise<void> {
    if (!this.config.prewarmEnabled || this.isPrewarming) return

    this.isPrewarming = true
    this.prewarmQueue.push(...keys)

    try {
      const pendingKeys = [...this.prewarmQueue]
      await processKeyBatches(pendingKeys, 5, key => this.prefetch(key))
    } finally {
      this.prewarmQueue = []
      this.isPrewarming = false
    }
  }

  private async prefetch(key: string): Promise<void> {
    const cacheKey = generateCacheKey(key)
    if (await hasCachedKey(this.kv, cacheKey)) {
      return
    }
  }

  // 智能清理过期存储（KV 层面）
  async cleanupKV(): Promise<void> {
    const expiredKeys = collectExpiredCacheKeys(this.accessStats, this.config.maxAge)

    if (expiredKeys.length > 0) {
      console.log(`Cleaning up ${expiredKeys.length} expired cache entries`)
      await Promise.all(expiredKeys.map(key => this.kv.delete(key)))
    }

    for (const key of expiredKeys) {
      this.accessStats.delete(key)
    }
  }

  /**
   * 智能缓存预热 - 基于访问模式预测热点数据
   */
  async smartWarmup(fetcher: (key: string) => Promise<unknown>, maxKeys = 20): Promise<void> {
    if (!this.config.prewarmEnabled || this.isPrewarming) return

    this.isPrewarming = true

    try {
      const hotKeys = analyzeHotKeys(this.accessStats, maxKeys)

      if (hotKeys.length === 0) return

      console.log(`Smart warming cache for ${hotKeys.length} predicted hot keys...`)

      await processKeyBatches(hotKeys, 3, async key => {
        try {
          const data = await fetcher(key)
          if (data) {
            await this.set(key, data, undefined, true)
          }
        } catch (error) {
          console.warn(`Failed to warm key ${key}:`, error)
        }
      })

      console.log('Smart cache warmup completed')
    } finally {
      this.isPrewarming = false
    }
  }

  getStats() {
    return summarizeAccessStats(this.accessStats)
  }
}
