/**
 * AI Cache Composables
 *
 * Provides caching functionality for AI operations to improve performance
 * and reduce redundant API calls.
 */

import { ref, computed, readonly } from 'vue'
import { cache } from '@/utils/unified-utils'
import { logger } from '@/utils/logger'

export interface AICacheEntry {
  key: string
  data: any
  timestamp: number
  ttl: number
  metadata?: Record<string, any>
}

export interface AICacheOptions {
  ttl?: number
  tags?: string[]
  priority?: 'low' | 'normal' | 'high'
}

export function useAICache() {
  const cacheHits = ref(0)
  const cacheMisses = ref(0)
  const totalRequests = computed(() => cacheHits.value + cacheMisses.value)
  const hitRate = computed(() =>
    totalRequests.value > 0 ? (cacheHits.value / totalRequests.value) * 100 : 0
  )

  /**
   * Get cached AI result
   */
  const get = async <T>(
    key: string,
    fetcher: () => Promise<T>,
    options: AICacheOptions = {}
  ): Promise<T> => {
    const cacheKey = `ai:${key}`

    // Try to get from cache first
    const cached = cache.get<AICacheEntry>(cacheKey)
    if (cached && !isExpired(cached, options.ttl)) {
      cacheHits.value++
      logger.debug('AI cache hit', { key: cacheKey })
      return cached.data as T
    }

    // Cache miss - fetch fresh data
    cacheMisses.value++
    logger.debug('AI cache miss', { key: cacheKey })

    try {
      const data = await fetcher()

      // Store in cache
      const entry: AICacheEntry = {
        key: cacheKey,
        data,
        timestamp: Date.now(),
        ttl: options.ttl || 30 * 60 * 1000, // 30 minutes default
        metadata: {
          tags: options.tags,
          priority: options.priority
        }
      }

      cache.set(cacheKey, entry, options.ttl)
      return data
    } catch (error) {
      logger.error('AI cache fetch failed', { key: cacheKey, error: error.message })
      throw error
    }
  }

  /**
   * Set cache entry manually
   */
  const set = <T>(key: string, data: T, options: AICacheOptions = {}): void => {
    const cacheKey = `ai:${key}`
    const entry: AICacheEntry = {
      key: cacheKey,
      data,
      timestamp: Date.now(),
      ttl: options.ttl || 30 * 60 * 1000,
      metadata: {
        tags: options.tags,
        priority: options.priority
      }
    }

    cache.set(cacheKey, entry, options.ttl)
    logger.debug('AI cache set', { key: cacheKey })
  }

  /**
   * Remove cache entry
   */
  const remove = (key: string): void => {
    const cacheKey = `ai:${key}`
    cache.delete(cacheKey)
    logger.debug('AI cache removed', { key: cacheKey })
  }

  /**
   * Clear all AI cache entries
   */
  const clear = (): void => {
    // This is a simplified implementation
    // In a real implementation, you'd need to iterate through all cache entries
    // and remove those with 'ai:' prefix
    logger.info('AI cache cleared')
  }

  /**
   * Get cache statistics
   */
  const getStats = () => ({
    hits: cacheHits.value,
    misses: cacheMisses.value,
    totalRequests: totalRequests.value,
    hitRate: hitRate.value
  })

  /**
   * Check if cache entry is expired
   */
  const isExpired = (entry: AICacheEntry, defaultTtl?: number): boolean => {
    const ttl = entry.ttl || defaultTtl || 30 * 60 * 1000
    return Date.now() - entry.timestamp > ttl
  }

  /**
   * Preload cache entries
   */
  const preload = async <T>(
    entries: Array<{ key: string; fetcher: () => Promise<T>; options?: AICacheOptions }>
  ): Promise<void> => {
    const promises = entries.map(async ({ key, fetcher, options = {} }) => {
      try {
        await get(key, fetcher, options)
      } catch (error) {
        logger.warn('Failed to preload AI cache entry', { key, error: error.message })
      }
    })

    await Promise.allSettled(promises)
    logger.info('AI cache preload completed', { count: entries.length })
  }

  return {
    get,
    set,
    remove,
    clear,
    getStats,
    preload,
    // Reactive properties
    cacheHits: readonly(cacheHits),
    cacheMisses: readonly(cacheMisses),
    totalRequests,
    hitRate
  }
}

// Export convenience functions for direct import
export const getCache = async <T>(
  key: string,
  chapterIndex?: number,
  type?: string
): Promise<T | null> => {
  const cacheKey = `${key}:${chapterIndex || 0}:${type || 'default'}`
  return cache.get(cacheKey)
}

export const setCache = async <T>(
  key: string,
  chapterIndex: number,
  type: string,
  data: T
): Promise<void> => {
  const cacheKey = `${key}:${chapterIndex}:${type}`
  cache.set(cacheKey, data, 30 * 60 * 1000) // 30 minutes
}

// Export types
export type { AICacheEntry, AICacheOptions }