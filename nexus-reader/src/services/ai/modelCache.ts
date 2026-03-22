/**
 * 模型缓存管理器
 * 使用 IndexedDB 记录本地 AI 运行时缓存的最小元数据
 */

import { openDB, type IDBPDatabase } from 'idb'
import { logger } from '@/utils/logger'

interface CacheStats {
  totalSize: number
  modelCount: number
  oldestAccess: number
  newestAccess: number
}

class ModelCacheManager {
  private static instance: ModelCacheManager
  private db: IDBPDatabase | null = null
  private readonly DB_NAME = 'nexus-ai-models'
  private readonly DB_VERSION = 1
  private readonly STORE_NAME = 'models'
  private readonly MAX_MODEL_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

  private constructor() {}

  static getInstance(): ModelCacheManager {
    if (!ModelCacheManager.instance) {
      ModelCacheManager.instance = new ModelCacheManager()
    }
    return ModelCacheManager.instance
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    try {
      this.db = await openDB(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('models')) {
            const store = db.createObjectStore('models', { keyPath: 'id' })
            store.createIndex('lastAccessed', 'metadata.lastAccessed')
            store.createIndex('timestamp', 'metadata.timestamp')
          }
        },
      })

      logger.info('[Model Cache] Database initialized successfully')

      // 启动时清理过期模型
      await this.cleanupExpiredModels()
    } catch (error: any) {
      logger.error('[Model Cache] Failed to initialize database:', error as Error)
      throw error
    }
  }

  /**
   * 检查模型是否已缓存
   */
  async isModelCached(modelId: string): Promise<boolean> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const cachedModel = await this.db!.get(this.STORE_NAME, modelId)
      return cachedModel !== undefined
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to check if model ${modelId} is cached:`, error as Error)
      return false
    }
  }

  /**
   * 删除缓存的模型
   */
  private async removeCachedModel(modelId: string): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      await this.db!.delete(this.STORE_NAME, modelId)
      logger.info(`[Model Cache] Removed cached model ${modelId}`)
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to remove cached model ${modelId}:`, error as Error)
      throw error
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<CacheStats> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const models = await this.db!.getAll(this.STORE_NAME)

      const stats: CacheStats = {
        totalSize: 0,
        modelCount: models.length,
        oldestAccess: Date.now(),
        newestAccess: 0,
      }

      for (const model of models) {
        stats.totalSize += model.metadata.size
        stats.oldestAccess = Math.min(stats.oldestAccess, model.metadata.lastAccessed)
        stats.newestAccess = Math.max(stats.newestAccess, model.metadata.lastAccessed)
      }

      return stats
    } catch (error: any) {
      logger.error('[Model Cache] Failed to get cache stats:', error as Error)
      return {
        totalSize: 0,
        modelCount: 0,
        oldestAccess: Date.now(),
        newestAccess: 0,
      }
    }
  }

  /**
   * 清理所有缓存
   */
  async clearCache(): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      await this.db!.clear(this.STORE_NAME)
      logger.info('[Model Cache] Cache cleared successfully')
    } catch (error: any) {
      logger.error('[Model Cache] Failed to clear cache:', error as Error)
      throw error
    }
  }

  /**
   * 清理过期模型
   */
  private async cleanupExpiredModels(): Promise<void> {
    try {
      const models = await this.db!.getAll(this.STORE_NAME)
      const now = Date.now()
      let cleanedCount = 0

      for (const model of models) {
        if (now - model.metadata.lastAccessed > this.MAX_MODEL_AGE) {
          await this.removeCachedModel(model.id)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        logger.info(`[Model Cache] Cleaned up ${cleanedCount} expired models`)
      }
    } catch (error: any) {
      logger.error('[Model Cache] Failed to cleanup expired models:', error as Error)
    }
  }

  /**
   * 预热缓存（预加载常用模型）
   */
  async warmupCache(modelIds: string[]): Promise<void> {
    logger.info(`[Model Cache] Starting cache warmup for ${modelIds.length} models`)

    for (const modelId of modelIds) {
      const isCached = await this.isModelCached(modelId)
      if (!isCached) {
        logger.info(
          `[Model Cache] Model ${modelId} not cached; skipping warmup because no remote preload source is configured`
        )
      }
    }
  }
}

// 导出单例实例
export const modelCacheManager = ModelCacheManager.getInstance()
