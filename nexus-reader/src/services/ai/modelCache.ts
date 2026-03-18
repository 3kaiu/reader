/**
 * 模型缓存管理器
 * 使用IndexedDB存储AI模型和相关资源，支持LRU缓存策略
 */

import { openDB, type IDBPDatabase } from 'idb'
import { errorHandler as _errorHandler, logger } from '@/utils/unified-utils'

interface CachedModel {
  id: string
  data: ArrayBuffer
  metadata: {
    size: number
    timestamp: number
    lastAccessed: number
    version: string
    checksum?: string
    accessCount?: number
    preloaded?: boolean
  }
}

interface CacheStats {
  totalSize: number
  modelCount: number
  oldestAccess: number
  newestAccess: number
}

interface ModelUsageStats {
  modelId: string
  accessCount: number
  lastAccessed: number
  frequency: number
  priority: number
}

interface NetworkCondition {
  effectiveType: string
  downlink: number
  rtt: number
  saveData: boolean
}

interface PreloadCandidate {
  modelId: string
  priority: number
  estimatedSize: number
  networkPriority: number
}

export class ModelCacheManager {
  private static instance: ModelCacheManager
  private db: IDBPDatabase | null = null
  private readonly DB_NAME = 'nexus-ai-models'
  private readonly DB_VERSION = 1
  private readonly STORE_NAME = 'models'
  private readonly MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB
  private readonly MAX_MODEL_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

  // 性能优化
  private isPreloading = false
  private preloadSemaphore = 2 // 最多2个并发预加载
  private activePreloads = 0

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
   * 缓存模型数据
   */
  async cacheModel(
    modelId: string,
    data: ArrayBuffer,
    metadata: Partial<CachedModel['metadata']> = {}
  ): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const now = Date.now()
      const cachedModel: CachedModel = {
        id: modelId,
        data,
        metadata: {
          size: data.byteLength,
          timestamp: now,
          lastAccessed: now,
          version: metadata.version || '1.0.0',
          checksum: metadata.checksum,
        },
      }

      // 检查缓存空间
      await this.ensureCacheSpace(data.byteLength)

      // 存储模型
      await this.db!.put(this.STORE_NAME, cachedModel)

      logger.info(`[Model Cache] Cached model ${modelId} (${this.formatBytes(data.byteLength)})`)
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to cache model ${modelId}:`, error as Error)
      throw error
    }
  }

  /**
   * 获取缓存的模型
   */
  async getCachedModel(modelId: string): Promise<ArrayBuffer | null> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const cachedModel = await this.db!.get(this.STORE_NAME, modelId)

      if (!cachedModel) {
        return null
      }

      // 更新最后访问时间和访问次数
      cachedModel.metadata.lastAccessed = Date.now()
      cachedModel.metadata.accessCount = (cachedModel.metadata.accessCount || 0) + 1
      await this.db!.put(this.STORE_NAME, cachedModel)

      logger.info(`[Model Cache] Retrieved cached model ${modelId}`)
      return cachedModel.data
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to get cached model ${modelId}:`, error as Error)
      return null
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
  async removeCachedModel(modelId: string): Promise<void> {
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
   * 确保有足够的缓存空间
   */
  private async ensureCacheSpace(requiredSize: number): Promise<void> {
    const stats = await this.getCacheStats()

    if (stats.totalSize + requiredSize <= this.MAX_CACHE_SIZE) {
      return // 有足够空间
    }

    logger.info(
      `[Model Cache] Need to free space: ${this.formatBytes(requiredSize)} required, ${this.formatBytes(this.MAX_CACHE_SIZE - stats.totalSize)} available`
    )

    // 使用LRU策略删除最久未访问的模型
    const models = await this.db!.getAll(this.STORE_NAME)
    models.sort((a, b) => a.metadata.lastAccessed - b.metadata.lastAccessed)

    let freedSpace = 0
    for (const model of models) {
      if (stats.totalSize - freedSpace + requiredSize <= this.MAX_CACHE_SIZE) {
        break
      }

      await this.removeCachedModel(model.id)
      freedSpace += model.metadata.size
      logger.info(
        `[Model Cache] Freed ${this.formatBytes(model.metadata.size)} by removing ${model.id}`
      )
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
   * 智能预加载模型
   * 基于使用频率和网络条件预测需要预加载的模型
   */
  async smartPreloadModels(networkCondition?: NetworkCondition): Promise<void> {
    if (this.isPreloading || !this.db) return

    this.isPreloading = true

    try {
      // 获取模型使用统计
      const usageStats = await this.getModelUsageStats()
      const candidates = this.selectPreloadCandidates(usageStats, networkCondition)

      if (candidates.length === 0) {
        logger.info('[Model Cache] No models need preloading')
        return
      }

      logger.info(`[Model Cache] Starting smart preload for ${candidates.length} models`)

      // 按优先级排序并限制并发
      candidates.sort((a, b) => b.priority - a.priority)

      for (const candidate of candidates) {
        if (this.activePreloads >= this.preloadSemaphore) {
          // 等待一个预加载完成
          await this.waitForPreloadSlot()
        }

        this.preloadModel(candidate.modelId).catch(error => {
          logger.warn(`[Model Cache] Failed to preload ${candidate.modelId}:`, error)
        })
      }

      // 等待所有预加载完成
      while (this.activePreloads > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      logger.info('[Model Cache] Smart preload completed')
    } catch (error: any) {
      logger.error('[Model Cache] Smart preload failed:', error as Error)
    } finally {
      this.isPreloading = false
    }
  }

  /**
   * 等待预加载槽位
   */
  private async waitForPreloadSlot(): Promise<void> {
    return new Promise(resolve => {
      const checkSlot = () => {
        if (this.activePreloads < this.preloadSemaphore) {
          resolve()
        } else {
          setTimeout(checkSlot, 100)
        }
      }
      checkSlot()
    })
  }

  /**
   * 预加载单个模型
   */
  private async preloadModel(modelId: string): Promise<void> {
    this.activePreloads++

    try {
      // 检查是否已缓存
      const existing = await this.getCachedModel(modelId)
      if (existing) {
        logger.debug(`[Model Cache] Model ${modelId} already cached`)
        return
      }

      // TODO: 实现从CDN或其他源获取模型的逻辑
      // 这里需要根据实际的模型分发策略实现
      logger.info(`[Model Cache] Would preload model: ${modelId}`)

      // 标记为预加载状态
      // await this.markAsPreloaded(modelId)
    } finally {
      this.activePreloads--
    }
  }

  /**
   * 获取模型使用统计
   */
  private async getModelUsageStats(): Promise<ModelUsageStats[]> {
    const models = await this.db!.getAll(this.STORE_NAME)
    const now = Date.now()

    return models.map(model => {
      const accessCount = model.metadata.accessCount || 0
      const lastAccessed = model.metadata.lastAccessed
      const daysSinceAccess = (now - lastAccessed) / (24 * 60 * 60 * 1000)

      // 计算使用频率 (最近30天内的访问次数)
      const frequency = daysSinceAccess <= 30 ? accessCount / Math.max(daysSinceAccess, 1) : 0

      // 计算优先级：频率越高 + 最近访问过 = 优先级越高
      const recencyBonus = Math.max(0, 30 - daysSinceAccess) / 30 // 30天内递减
      const priority = frequency * (1 + recencyBonus)

      return {
        modelId: model.id,
        accessCount,
        lastAccessed,
        frequency,
        priority,
      }
    })
  }

  /**
   * 选择预加载候选模型
   */
  private selectPreloadCandidates(
    usageStats: ModelUsageStats[],
    networkCondition?: NetworkCondition
  ): PreloadCandidate[] {
    // 按优先级排序
    const sorted = usageStats.sort((a, b) => b.priority - a.priority)

    // 网络条件调整
    let maxCandidates = 3 // 默认预加载3个

    if (networkCondition) {
      if (networkCondition.effectiveType === '4g' || networkCondition.downlink > 5) {
        maxCandidates = 5 // 好网络多预加载
      } else if (networkCondition.effectiveType === '3g' || networkCondition.saveData) {
        maxCandidates = 1 // 差网络少预加载
      }
    }

    return sorted.slice(0, maxCandidates).map(stat => ({
      modelId: stat.modelId,
      priority: stat.priority,
      estimatedSize: this.estimateModelSize(stat.modelId),
      networkPriority: this.calculateNetworkPriority(stat, networkCondition),
    }))
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 验证模型完整性
   */
  async verifyModelIntegrity(modelId: string, expectedChecksum?: string): Promise<boolean> {
    if (!expectedChecksum) {
      return true // 无法验证，假设正确
    }

    try {
      const cachedModel = await this.db!.get(this.STORE_NAME, modelId)
      if (!cachedModel) {
        return false
      }

      // 简单的校验和验证（实际应用中可能需要更复杂的算法）
      return cachedModel.metadata.checksum === expectedChecksum
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to verify model integrity for ${modelId}:`, error as Error)
      return false
    }
  }

  /**
   * 获取所有缓存的模型ID
   */
  async getCachedModelIds(): Promise<string[]> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const models = await this.db!.getAll(this.STORE_NAME)
      return models.map(model => model.id)
    } catch (error: any) {
      logger.error('[Model Cache] Failed to get cached model IDs:', error as Error)
      return []
    }
  }

  /**
   * 预热缓存（预加载常用模型）
   */
  async warmupCache(modelIds: string[]): Promise<void> {
    logger.info(`[Model Cache] Starting cache warmup for ${modelIds.length} models`)

    // 这里可以实现预加载逻辑
    // 实际实现中会从CDN下载并缓存这些模型
    for (const modelId of modelIds) {
      const isCached = await this.isModelCached(modelId)
      if (!isCached) {
        logger.info(`[Model Cache] Model ${modelId} not cached, would download in background`)
        // 实际实现中会触发后台下载
      }
    }
  }

  /**
   * 智能预加载策略
   * 根据使用频率和网络状况预加载模型
   */
  async intelligentPreload(): Promise<void> {
    try {
      logger.info('[Model Cache] Starting intelligent preload...')

      // 获取使用统计
      const usageStats = await this.getModelUsageStats()

      // 检测网络状况
      const networkInfo = await this.detectNetworkCondition()

      // 根据网络状况调整预加载策略
      const preloadCandidates = this.selectPreloadCandidates(usageStats, networkInfo)

      // 后台预加载
      for (const candidate of preloadCandidates) {
        if (!(await this.isModelCached(candidate.modelId))) {
          await this.backgroundPreload(candidate)
        }
      }

      logger.info(
        `[Model Cache] Intelligent preload completed for ${preloadCandidates.length} models`
      )
    } catch (error: any) {
      logger.error('[Model Cache] Intelligent preload failed:', error as Error)
    }
  }

  /**
   * 后台预加载模型
   */
  private async backgroundPreload(candidate: PreloadCandidate): Promise<void> {
    try {
      logger.info(`[Model Cache] Background preloading ${candidate.modelId}...`)

      // 这里应该实现实际的模型下载逻辑
      // 为了演示，我们模拟一个下载过程
      const modelUrl = this.getModelUrl(candidate.modelId)

      // 使用低优先级请求避免影响用户操作
      const response = await fetch(modelUrl, {
        priority: 'low' as any, // 实验性API
      })

      if (response.ok) {
        const modelData = await response.arrayBuffer()
        await this.cacheModel(candidate.modelId, modelData, {
          version: '1.0.0',
          preloaded: true,
        })

        logger.info(`[Model Cache] Successfully preloaded ${candidate.modelId}`)
      }
    } catch (error: any) {
      logger.warn(`[Model Cache] Failed to preload ${candidate.modelId}:`, error as Error)
    }
  }

  /**
   * 检测网络状况
   */
  private async detectNetworkCondition(): Promise<NetworkCondition> {
    try {
      const connection =
        (navigator as any).connection ||
        (navigator as any).mozConnection ||
        (navigator as any).webkitConnection
      if (connection) {
        return {
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 100,
          saveData: connection.saveData || false,
        }
      }
      return { effectiveType: '4g', downlink: 10, rtt: 100, saveData: false }
    } catch (err) {
      return { effectiveType: '4g', downlink: 10, rtt: 100, saveData: false }
    }
  }

  /**
   * 估算模型大小
   */
  private estimateModelSize(_modelId: string): number {
    return 0
  }

  /**
   * 计算网络优先级
   */
  private calculateNetworkPriority(
    _stat: ModelUsageStats,
    _networkInfo?: NetworkCondition
  ): number {
    return 0
  }

  /**
   * 获取模型下载URL
   */
  private getModelUrl(modelId: string): string {
    // 这里应该返回实际的模型下载URL
    // 为了演示，返回一个模拟URL
    return `https://cdn.example.com/models/${modelId}.bin`
  }

  /**
   * 更新模型访问统计
   */
  async updateModelAccess(modelId: string): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const cachedModel = await this.db!.get(this.STORE_NAME, modelId)
      if (cachedModel) {
        cachedModel.metadata.lastAccessed = Date.now()
        cachedModel.metadata.accessCount = (cachedModel.metadata.accessCount || 0) + 1
        await this.db!.put(this.STORE_NAME, cachedModel)
      }
    } catch (error: any) {
      logger.error(`[Model Cache] Failed to update access stats for ${modelId}:`, error as Error)
    }
  }

  /**
   * 获取预加载建议
   */
  async getPreloadRecommendations(): Promise<string[]> {
    const usageStats = await this.getModelUsageStats()
    const networkInfo = await this.detectNetworkCondition()
    const candidates = this.selectPreloadCandidates(usageStats, networkInfo)

    return candidates.map(c => c.modelId)
  }
}

// 导出单例实例
export const modelCacheManager = ModelCacheManager.getInstance()
