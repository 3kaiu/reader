/**
 * 模型缓存管理器
 * 使用IndexedDB存储AI模型和相关资源，支持LRU缓存策略
 */

import { openDB, type IDBPDatabase } from 'idb'
import { logger } from '@/utils/logger'

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
    } catch (error) {
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
        }
      }

      // 检查缓存空间
      await this.ensureCacheSpace(data.byteLength)

      // 存储模型
      await this.db!.put(this.STORE_NAME, cachedModel)
      
      logger.info(`[Model Cache] Cached model ${modelId} (${this.formatBytes(data.byteLength)})`)
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
        newestAccess: 0
      }

      for (const model of models) {
        stats.totalSize += model.metadata.size
        stats.oldestAccess = Math.min(stats.oldestAccess, model.metadata.lastAccessed)
        stats.newestAccess = Math.max(stats.newestAccess, model.metadata.lastAccessed)
      }

      return stats
    } catch (error) {
      logger.error('[Model Cache] Failed to get cache stats:', error as Error)
      return {
        totalSize: 0,
        modelCount: 0,
        oldestAccess: Date.now(),
        newestAccess: 0
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
    } catch (error) {
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

    logger.info(`[Model Cache] Need to free space: ${this.formatBytes(requiredSize)} required, ${this.formatBytes(this.MAX_CACHE_SIZE - stats.totalSize)} available`)

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
      logger.info(`[Model Cache] Freed ${this.formatBytes(model.metadata.size)} by removing ${model.id}`)
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
    } catch (error) {
      logger.error('[Model Cache] Failed to cleanup expired models:', error as Error)
    }
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
    } catch (error) {
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
    } catch (error) {
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
        if (!await this.isModelCached(candidate.modelId)) {
          await this.backgroundPreload(candidate)
        }
      }
      
      logger.info(`[Model Cache] Intelligent preload completed for ${preloadCandidates.length} models`)
    } catch (error) {
      logger.error('[Model Cache] Intelligent preload failed:', error as Error)
    }
  }

  /**
   * 获取模型使用统计
   */
  private async getModelUsageStats(): Promise<ModelUsageStats[]> {
    if (!this.db) {
      await this.initialize()
    }

    try {
      const models = await this.db!.getAll(this.STORE_NAME)
      const now = Date.now()
      
      return models.map(model => ({
        modelId: model.id,
        accessCount: model.metadata.accessCount || 1,
        lastAccessed: model.metadata.lastAccessed,
        frequency: this.calculateAccessFrequency(model.metadata),
        priority: this.calculatePreloadPriority(model.metadata, now)
      })).sort((a, b) => b.priority - a.priority)
    } catch (error) {
      logger.error('[Model Cache] Failed to get usage stats:', error as Error)
      return []
    }
  }

  /**
   * 检测网络状况
   */
  private async detectNetworkCondition(): Promise<NetworkCondition> {
    try {
      // 使用Navigator API检测网络状况
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
      
      if (connection) {
        return {
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 100,
          saveData: connection.saveData || false
        }
      }
      
      // 回退到默认网络状况
      return {
        effectiveType: '4g',
        downlink: 10,
        rtt: 100,
        saveData: false
      }
    } catch (error) {
      logger.warn('[Model Cache] Failed to detect network condition:', error as Error)
      return {
        effectiveType: '4g',
        downlink: 10,
        rtt: 100,
        saveData: false
      }
    }
  }

  /**
   * 选择预加载候选模型
   */
  private selectPreloadCandidates(
    usageStats: ModelUsageStats[], 
    networkInfo: NetworkCondition
  ): PreloadCandidate[] {
    const candidates: PreloadCandidate[] = []
    
    // 根据网络状况调整预加载数量
    let maxCandidates = 3 // 默认预加载3个模型
    
    if (networkInfo.saveData) {
      maxCandidates = 1 // 节省数据模式下只预加载1个
    } else if (networkInfo.effectiveType === '4g' && networkInfo.downlink > 5) {
      maxCandidates = 5 // 高速网络下预加载更多
    } else if (networkInfo.effectiveType === '3g' || networkInfo.downlink < 2) {
      maxCandidates = 2 // 慢速网络下减少预加载
    }
    
    // 选择高优先级模型
    for (let i = 0; i < Math.min(usageStats.length, maxCandidates); i++) {
      const stat = usageStats[i]
      candidates.push({
        modelId: stat.modelId,
        priority: stat.priority,
        estimatedSize: this.estimateModelSize(stat.modelId),
        networkPriority: this.calculateNetworkPriority(stat, networkInfo)
      })
    }
    
    return candidates.sort((a, b) => b.networkPriority - a.networkPriority)
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
        priority: 'low' as any // 实验性API
      })
      
      if (response.ok) {
        const modelData = await response.arrayBuffer()
        await this.cacheModel(candidate.modelId, modelData, {
          version: '1.0.0',
          preloaded: true
        })
        
        logger.info(`[Model Cache] Successfully preloaded ${candidate.modelId}`)
      }
    } catch (error) {
      logger.warn(`[Model Cache] Failed to preload ${candidate.modelId}:`, error as Error)
    }
  }

  /**
   * 计算访问频率
   */
  private calculateAccessFrequency(metadata: CachedModel['metadata']): number {
    const now = Date.now()
    const daysSinceCreation = (now - metadata.timestamp) / (24 * 60 * 60 * 1000)
    const accessCount = metadata.accessCount || 1
    
    return daysSinceCreation > 0 ? accessCount / daysSinceCreation : accessCount
  }

  /**
   * 计算预加载优先级
   */
  private calculatePreloadPriority(metadata: CachedModel['metadata'], now: number): number {
    const frequency = this.calculateAccessFrequency(metadata)
    const recency = Math.max(0, 1 - (now - metadata.lastAccessed) / (7 * 24 * 60 * 60 * 1000)) // 7天内的访问权重更高
    
    return frequency * 0.7 + recency * 0.3
  }

  /**
   * 估算模型大小
   */
  private estimateModelSize(modelId: string): number {
    // 根据模型ID估算大小，实际应用中可能需要更精确的方法
    if (modelId.includes('large') || modelId.includes('8b')) {
      return 4 * 1024 * 1024 * 1024 // 4GB
    } else if (modelId.includes('medium') || modelId.includes('3b')) {
      return 2 * 1024 * 1024 * 1024 // 2GB
    } else if (modelId.includes('small') || modelId.includes('1b')) {
      return 1 * 1024 * 1024 * 1024 // 1GB
    }
    
    return 500 * 1024 * 1024 // 默认500MB
  }

  /**
   * 计算网络优先级
   */
  private calculateNetworkPriority(stat: ModelUsageStats, networkInfo: NetworkCondition): number {
    let priority = stat.priority
    
    // 根据网络状况调整优先级
    if (networkInfo.saveData) {
      priority *= 0.5 // 节省数据模式下降低优先级
    }
    
    if (networkInfo.effectiveType === '2g' || networkInfo.downlink < 1) {
      priority *= 0.3 // 极慢网络下大幅降低优先级
    } else if (networkInfo.effectiveType === '3g' || networkInfo.downlink < 3) {
      priority *= 0.7 // 慢网络下降低优先级
    }
    
    return priority
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
    } catch (error) {
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