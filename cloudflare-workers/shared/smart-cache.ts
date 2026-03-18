/**
 * Smart Cache Service (智能缓存服务)
 * 提供多层缓存、智能过期、预热机制
 */

import { generateCacheKey, getFromCache, saveToCache } from './cache.ts';
import type { KVNamespaceFallback } from './types.ts';

// 缓存配置常量
export const SMART_CACHE_CONFIGS = {
  DECODE_RESULTS: {
    ttl: 3600, // 1小时
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

export interface SmartCacheConfig {
  ttl: number;
  maxAge: number;
  prewarmEnabled: boolean;
  hitRateThreshold: number;
  adaptiveTTL: boolean;
}

export class SmartCache {
  private kv: any | KVNamespaceFallback;
  private config: SmartCacheConfig;
  private accessStats = new Map<string, { hits: number; misses: number; lastAccess: number; ttl: number }>();
  private prewarmQueue: string[] = [];
  private isPrewarming = false;
  private maxStatsSize = 10000; // 最大统计条目数
  private statsCleanupInterval = 5 * 60 * 1000; // 5分钟清理一次
  private lastCleanup = Date.now();

  constructor(kv: any | KVNamespaceFallback, config: SmartCacheConfig) {
    this.kv = kv;
    this.config = config;
  }

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = generateCacheKey(key);

    // 检查是否需要清理统计信息
    this.cleanupStatsIfNeeded();

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

  async set<T>(key: string, value: T, customTTL?: number, compress: boolean = true): Promise<void> {
    const cacheKey = generateCacheKey(key);
    const serializedValue = JSON.stringify(value);
    const baseTTL = customTTL || this.config.ttl;

    // Calculate adaptive TTL
    const adaptiveTTL = this.getAdaptiveTTL(cacheKey);

    try {
      await saveToCache(this.kv, cacheKey, serializedValue, 'application/json', adaptiveTTL, compress);

      // 更新统计信息
      const stats = this.accessStats.get(cacheKey) || { hits: 0, misses: 0, lastAccess: Date.now(), ttl: adaptiveTTL };
      stats.ttl = adaptiveTTL;
      stats.lastAccess = Date.now();
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
    } catch { }

    // 这里可以添加从源获取数据的逻辑
  }

  // 智能清理过期存储（KV 层面）
  async cleanupKV(): Promise<void> {
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

  /**
   * 清理过期的统计信息 (内存层面)
   */
  private cleanupStatsIfNeeded(): void {
    const now = Date.now();

    // 检查是否到了清理时间
    if (now - this.lastCleanup < this.statsCleanupInterval) {
      return;
    }

    // 如果统计信息过多，进行清理
    if (this.accessStats.size > this.maxStatsSize) {
      this.cleanupOldStats();
    }

    this.lastCleanup = now;
  }

  /**
   * 清理最旧的统计信息
   */
  private cleanupOldStats(): void {
    const entries = Array.from(this.accessStats.entries());

    // 按最后访问时间排序
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // 保留最新的70%，清理最旧的30%
    const keepCount = Math.floor(entries.length * 0.7);
    const newStatsMap = new Map<string, { hits: number; misses: number; lastAccess: number; ttl: number }>();

    for (let i = keepCount; i < entries.length; i++) {
      newStatsMap.set(entries[i][0], entries[i][1]);
    }

    this.accessStats = newStatsMap;
    console.log(`Cleaned up ${entries.length - keepCount} old cache stats entries`);
  }

  /**
   * 智能缓存预热 - 基于访问模式预测热点数据
   */
  async smartWarmup(fetcher: (key: string) => Promise<any>, maxKeys: number = 20): Promise<void> {
    if (!this.config.prewarmEnabled || this.isPrewarming) return;

    this.isPrewarming = true;

    try {
      // 分析访问模式，找出热点键
      const hotKeys = this.analyzeHotKeys(maxKeys);

      if (hotKeys.length === 0) return;

      console.log(`Smart warming cache for ${hotKeys.length} predicted hot keys...`);

      // 批量预热
      const batchSize = 3;
      for (let i = 0; i < hotKeys.length; i += batchSize) {
        const batch = hotKeys.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (key) => {
            try {
              const data = await fetcher(key);
              if (data) {
                await this.set(key, data, undefined, true);
              }
            } catch (e) {
              console.warn(`Failed to warm key ${key}:`, e);
            }
          })
        );
      }

      console.log('Smart cache warmup completed');
    } finally {
      this.isPrewarming = false;
    }
  }

  /**
   * 分析热点键 - 基于访问频率和时间模式
   */
  private analyzeHotKeys(maxKeys: number): string[] {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 计算每个键的热度评分
    const keyScores: Array<{ key: string; score: number }> = [];

    for (const [key, stats] of this.accessStats.entries()) {
      if (stats.lastAccess < oneDayAgo) continue; // 跳过一天没访问的

      // 热度评分 = 访问次数 * 时间权重 * 命中率
      const timeWeight = stats.lastAccess > oneHourAgo ? 2.0 : 1.0;
      const hitRate = stats.hits / (stats.hits + stats.misses || 1);
      const score = (stats.hits + stats.misses) * timeWeight * hitRate;

      keyScores.push({ key, score });
    }

    // 按评分排序，返回前N个
    return keyScores
      .sort((a, b) => b.score - a.score)
      .slice(0, maxKeys)
      .map(item => item.key);
  }

  getStats() {
    let totalHits = 0;
    let totalMisses = 0;
    for (const stats of this.accessStats.values()) {
      totalHits += stats.hits;
      totalMisses += stats.misses;
    }
    return {
      size: this.accessStats.size,
      totalHits,
      totalMisses,
      hitRate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0
    };
  }
}