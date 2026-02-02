/**
 * Smart Cache Service (智能缓存服务)
 * 提供多层缓存、智能过期、预热机制
 */

import { generateCacheKey, getFromCache, saveToCache } from './cache.ts';

export interface SmartCacheConfig {
  ttl: number;
  maxAge: number;
  prewarmEnabled: boolean;
  hitRateThreshold: number;
  adaptiveTTL: boolean;
}

export class SmartCache {
  private kv: KVNamespace;
  private config: SmartCacheConfig;
  private accessStats = new Map<string, { hits: number; misses: number; lastAccess: number; ttl: number }>();
  private prewarmQueue: string[] = [];
  private isPrewarming = false;

  constructor(kv: KVNamespace, config: SmartCacheConfig) {
    this.kv = kv;
    this.config = config;
  }

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = generateCacheKey(key);

    // 更新访问统计
    const stats = this.accessStats.get(cacheKey) || { hits: 0, misses: 0, lastAccess: 0, ttl: this.config.ttl };
    stats.lastAccess = Date.now();

    try {
      const cached = await getFromCache(this.kv, cacheKey);
      if (cached) {
        stats.hits++;
        this.accessStats.set(cacheKey, stats);
        return cached.body as T;
      }
    } catch (error) {
      console.warn('Cache get error:', error);
    }

    stats.misses++;
    this.accessStats.set(cacheKey, stats);
    return null;
  }

  async set<T>(key: string, value: T, customTTL?: number): Promise<void> {
    const cacheKey = generateCacheKey(key);
    const ttl = customTTL || this.getAdaptiveTTL(cacheKey);

    try {
      await saveToCache(this.kv, cacheKey, JSON.stringify(value), 'application/json', ttl);

      // 更新统计信息
      const stats = this.accessStats.get(cacheKey) || { hits: 0, misses: 0, lastAccess: Date.now(), ttl };
      stats.ttl = ttl;
      this.accessStats.set(cacheKey, stats);

    } catch (error) {
      console.warn('Cache set error:', error);
    }
  }

  private getAdaptiveTTL(cacheKey: string): number {
    if (!this.config.adaptiveTTL) return this.config.ttl;

    const stats = this.accessStats.get(cacheKey);
    if (!stats || stats.hits + stats.misses < 10) return this.config.ttl;

    const hitRate = stats.hits / (stats.hits + stats.misses);

    // 高命中率延长TTL，低命中率缩短TTL
    if (hitRate > this.config.hitRateThreshold) {
      return Math.min(this.config.maxAge, stats.ttl * 2);
    } else if (hitRate < 0.1) {
      return Math.max(60, stats.ttl / 2); // 最少1分钟
    }

    return stats.ttl;
  }

  // 批量预热缓存
  async prewarm(keys: string[]): Promise<void> {
    if (!this.config.prewarmEnabled || this.isPrewarming) return;

    this.isPrewarming = true;
    this.prewarmQueue.push(...keys);

    try {
      // 批量处理，避免过多并发
      const batchSize = 5;
      for (let i = 0; i < this.prewarmQueue.length; i += batchSize) {
        const batch = this.prewarmQueue.slice(i, i + batchSize);
        await Promise.all(batch.map(key => this.prefetch(key)));
      }
    } finally {
      this.prewarmQueue = [];
      this.isPrewarming = false;
    }
  }

  private async prefetch(key: string): Promise<void> {
    const cacheKey = generateCacheKey(key);

    // 检查是否已有缓存
    try {
      const existing = await getFromCache(this.kv, cacheKey);
      if (existing) return;
    } catch {}

    // 这里可以添加预热逻辑，比如预加载热门数据
    // 具体实现取决于数据源
  }

  // 智能清理过期缓存
  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, stats] of this.accessStats) {
      if (now - stats.lastAccess > this.config.maxAge * 1000) {
        expiredKeys.push(key);
      }
    }

    // 批量删除过期键
    if (expiredKeys.length > 0) {
      console.log(`Cleaning up ${expiredKeys.length} expired cache entries`);
      await Promise.all(expiredKeys.map(key => this.kv.delete(key)));
    }

    // 清理统计数据
    for (const key of expiredKeys) {
      this.accessStats.delete(key);
    }
  }

  // 获取缓存统计信息
  getStats(): {
    totalKeys: number;
    hitRate: number;
    avgTTL: number;
    totalHits: number;
    totalMisses: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;
    let totalTTL = 0;

    for (const stats of this.accessStats.values()) {
      totalHits += stats.hits;
      totalMisses += stats.misses;
      totalTTL += stats.ttl;
    }

    return {
      totalKeys: this.accessStats.size,
      hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
      avgTTL: this.accessStats.size > 0 ? totalTTL / this.accessStats.size : 0,
      totalHits,
      totalMisses
    };
  }

  // 预测需要预热的键
  predictHotKeys(limit = 10): string[] {
    return Array.from(this.accessStats.entries())
      .filter(([_, stats]) => stats.hits > 0)
      .sort((a, b) => {
        const aScore = a[1].hits / Math.max(1, a[1].hits + a[1].misses);
        const bScore = b[1].hits / Math.max(1, b[1].hits + b[1].misses);
        return bScore - aScore;
      })
      .slice(0, limit)
      .map(([key]) => key);
  }
}

// 缓存配置常量
export const SMART_CACHE_CONFIGS = {
  DECODE_RESULTS: {
    ttl: 3600, // 1小时
    maxAge: 86400, // 24小时
    prewarmEnabled: true,
    hitRateThreshold: 0.7,
    adaptiveTTL: true
  },
  DICTIONARY_DATA: {
    ttl: 7200, // 2小时
    maxAge: 604800, // 7天
    prewarmEnabled: true,
    hitRateThreshold: 0.8,
    adaptiveTTL: false
  },
  SEARCH_RESULTS: {
    ttl: 1800, // 30分钟
    maxAge: 3600, // 1小时
    prewarmEnabled: false,
    hitRateThreshold: 0.5,
    adaptiveTTL: true
  }
} as const;