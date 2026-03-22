/**
 * Offline Manager - 离线功能管理器
 * 提供离线检测、缓存内容服务和离线操作队列
 */

import { networkDetector } from '../network/optimizer'
import { nexusDB, StoreNames, type SyncTask } from '../../utils/db'
import { syncManager } from '../syncManager'
import { logger } from '../../utils/logger'

// 离线状态接口
export interface OfflineStatus {
  isOnline: boolean
  lastOnlineTime: number
  offlineDuration: number
  queuedOperations: number
  cachedContent: number
}

// 缓存内容接口
export interface CachedContent {
  id: string
  type: 'chapter' | 'book' | 'image' | 'api-response'
  url: string
  bookUrl?: string
  chapterUrl?: string
  data: any
  timestamp: number
  size: number
  priority: number
}

/**
 * 离线管理器
 */
class OfflineManager {
  private isOnline = true
  private lastOnlineTime = Date.now()
  private ready: Promise<void>
  // Use SyncManager's persisted queue as the single source of truth.
  private operationQueue: SyncTask[] = []
  private cachedContent = new Map<string, CachedContent>()
  private listeners: Array<(status: OfflineStatus) => void> = []

  constructor() {
    this.initOfflineDetection()
    this.ready = this.loadPersistedData().catch(error => {
      logger.error('Failed to load offline data', { error })
    })
  }

  async waitUntilReady(): Promise<void> {
    await this.ready
  }

  // 获取离线状态
  getOfflineStatus(): OfflineStatus {
    return {
      isOnline: this.isOnline,
      lastOnlineTime: this.lastOnlineTime,
      offlineDuration: this.isOnline ? 0 : Date.now() - this.lastOnlineTime,
      queuedOperations: this.operationQueue.length,
      cachedContent: this.cachedContent.size,
    }
  }

  // 检查是否在线
  isOnlineStatus(): boolean {
    return this.isOnline
  }

  // 清空操作队列
  clearQueue(): void {
    this.operationQueue = []
    void nexusDB
      .clear(StoreNames.SYNC_QUEUE)
      .then(() => this.refreshPersistedState())
      .catch(error => logger.error('Failed to clear sync queue', { error }))
    this.notifyListeners()
  }

  // 添加离线操作到队列
  async queueOperation(operation: {
    type: 'api-request' | 'user-action' | 'sync-data'
    method: string
    url: string
    data?: any
  }): Promise<void> {
    // Add to global SyncManager (persisted in IndexedDB `syncQueue`)
    await syncManager.addTask({
      type: operation.type,
      method: operation.method,
      url: operation.url,
      data: operation.data,
      priority: 'NORMAL',
    })

    await this.refreshPersistedState()
  }

  // 缓存内容
  cacheContent(content: Omit<CachedContent, 'timestamp'>): void {
    const cachedItem: CachedContent = {
      ...content,
      timestamp: Date.now(),
    }

    this.cachedContent.set(content.id, cachedItem)
    this.persistCachedContent()

    this.notifyListeners()
  }

  async removeCachedContent(id: string): Promise<void> {
    if (!this.cachedContent.has(id)) {
      return
    }

    this.cachedContent.delete(id)
    try {
      await nexusDB.delete(StoreNames.OFFLINE_CONTENT, id)
    } catch (error: any) {
      logger.error('Failed to delete cached content by key, falling back to snapshot persist', {
        error,
        id,
      })
      await this.persistCachedContent()
    }

    this.notifyListeners()
  }

  async clearCachedContent(): Promise<void> {
    this.cachedContent.clear()
    try {
      await nexusDB.clear(StoreNames.OFFLINE_CONTENT)
    } catch (error: any) {
      logger.error('Failed to clear cached content store', { error })
    }
    this.notifyListeners()
  }

  // 获取缓存内容
  getCachedContent(id: string): CachedContent | null {
    return this.cachedContent.get(id) || null
  }

  // 搜索缓存内容
  searchCachedContent(type?: string, query?: string): CachedContent[] {
    const results = Array.from(this.cachedContent.values())

    let filtered = results
    if (type) {
      filtered = filtered.filter(item => item.type === type)
    }

    if (query) {
      const lowerQuery = query.toLowerCase()
      filtered = filtered.filter(
        item =>
          item.id.toLowerCase().includes(lowerQuery) ||
          item.url.toLowerCase().includes(lowerQuery) ||
          (typeof item.data === 'string' && item.data.toLowerCase().includes(lowerQuery))
      )
    }

    // 按优先级和时间排序
    return filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      return b.timestamp - a.timestamp
    })
  }

  // 清理过期缓存内容
  cleanupExpiredContent(maxAge = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now()
    const expiredIds: string[] = []

    for (const [id, content] of this.cachedContent) {
      if (now - content.timestamp > maxAge) {
        expiredIds.push(id)
      }
    }

    expiredIds.forEach(id => {
      this.cachedContent.delete(id)
    })

    if (expiredIds.length > 0) {
      this.persistCachedContent()
      this.notifyListeners()
    }
  }

  // 添加状态变化监听器
  addStatusListener(listener: (status: OfflineStatus) => void): void {
    this.listeners.push(listener)
  }

  // 移除状态变化监听器
  removeStatusListener(listener: (status: OfflineStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 手动同步队列中的操作 (现在代理给 SyncManager)
  async syncQueuedOperations(): Promise<void> {
    logger.info('🔄 Triggering sync via SyncManager...')
    await syncManager.processQueue()
    await this.refreshPersistedState()
  }

  // 启动自动同步 (由 SyncManager 接管，此处保留空实现或代理)
  startAutoSync(_interval = 30000): void {
    logger.info('🔄 Auto sync is now handled by SyncManager')
  }

  // 停止自动同步
  stopAutoSync(): void {
    // SyncManager 负责轮询，这里暂不处理
  }

  // 获取离线可用的内容列表
  getOfflineAvailableContent(): CachedContent[] {
    return this.searchCachedContent().filter(content => {
      // 检查内容是否仍然有效
      const maxAge = this.getMaxAgeForContentType(content.type)
      return Date.now() - content.timestamp < maxAge
    })
  }

  // 预缓存重要内容
  async precacheImportantContent(contentIds: string[]): Promise<void> {
    if (!this.isOnline) {
      logger.warn('Cannot precache content while offline')
      return
    }

    for (const id of contentIds) {
      try {
        // 这里应该根据实际的API来获取内容
        // 示例：假设有一个通用的内容获取方法
        const content = await this.fetchContentForCaching(id)
        if (content) {
          this.cacheContent({
            id,
            type: content.type,
            url: content.url,
            data: content.data,
            size: this.calculateContentSize(content.data),
            priority: 10, // 高优先级
          })
        }
      } catch (error: unknown) {
        logger.error('Failed to precache content:', { id, error })
      }
    }
  }

  // 导出离线数据
  exportOfflineData(): {
    operations: SyncTask[]
    content: CachedContent[]
    status: OfflineStatus
  } {
    return {
      operations: [...this.operationQueue],
      content: Array.from(this.cachedContent.values()),
      status: this.getOfflineStatus(),
    }
  }

  // 导入离线数据
  importOfflineData(data: { operations?: SyncTask[]; content?: CachedContent[] }): void {
    if (data.operations) {
      this.operationQueue = data.operations
      nexusDB
        .clear(StoreNames.SYNC_QUEUE)
        .then(async () => {
          for (const task of data.operations!) {
            await nexusDB.put(StoreNames.SYNC_QUEUE, task)
          }
        })
        .catch(err => logger.error('Failed to import sync queue', { error: err }))
    }

    if (data.content) {
      this.cachedContent.clear()
      data.content.forEach(item => {
        this.cachedContent.set(item.id, item)
      })
      this.persistCachedContent()
    }

    this.notifyListeners()
  }

  async refreshPersistedState(): Promise<void> {
    try {
      await this.syncFromDatabase()
      this.notifyListeners()
    } catch (error: any) {
      logger.error('Failed to refresh offline data', { error })
      throw error
    }
  }

  private initOfflineDetection(): void {
    // 监听网络状态变化
    networkDetector.addNetworkChangeListener(info => {
      const wasOnline = this.isOnline
      this.isOnline = info.isOnline

      if (wasOnline && !this.isOnline) {
        // 刚刚离线
        this.lastOnlineTime = Date.now()
      } else if (!wasOnline && this.isOnline) {
        // 刚刚上线
        this.lastOnlineTime = Date.now()

        // 自动同步队列中的操作
        setTimeout(() => {
          this.syncQueuedOperations().catch(logger.error)
        }, 1000)
      }

      this.notifyListeners()
    })

    // 初始状态
    this.isOnline = networkDetector.getNetworkInfo().isOnline
  }

  private async fetchContentForCaching(_id: string): Promise<any> {
    // 预缓存逻辑暂时由调用方兜底，这里先保持 no-op。
    // 示例：从API缓存或通用缓存中获取
    // [Refactor] apiCache removed

    // 如果缓存中没有，可能需要从服务器获取
    // 这里返回null表示无法获取
    return null
  }

  private calculateContentSize(data: any): number {
    if (typeof data === 'string') {
      return data.length * 2 // UTF-16
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength
    }
    if (data instanceof Blob) {
      return data.size
    }
    return JSON.stringify(data).length * 2
  }

  private getMaxAgeForContentType(type: string): number {
    const maxAges: Record<string, number> = {
      chapter: 7 * 24 * 60 * 60 * 1000, // 7天
      book: 30 * 24 * 60 * 60 * 1000, // 30天
      image: 14 * 24 * 60 * 60 * 1000, // 14天
      'api-response': 24 * 60 * 60 * 1000, // 1天
    }
    return maxAges[type] || 24 * 60 * 60 * 1000
  }

  private async persistCachedContent(): Promise<void> {
    try {
      // In this refactor we keep in-memory as source-of-truth; persist snapshot.
      await nexusDB.clear(StoreNames.OFFLINE_CONTENT)
      for (const item of this.cachedContent.values()) {
        await nexusDB.put(StoreNames.OFFLINE_CONTENT, item)
      }
    } catch (error: any) {
      logger.error('Failed to persist cached content', { error })
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      await this.syncFromDatabase()

      logger.info('Loaded offline data', {
        queuedOperations: this.operationQueue.length,
        cachedItems: this.cachedContent.size,
      })
      this.notifyListeners()
    } catch (error: any) {
      logger.error('Failed to load persisted offline data', { error })
    }
  }

  private async syncFromDatabase(): Promise<void> {
    this.operationQueue = await nexusDB.getAll<SyncTask>(StoreNames.SYNC_QUEUE)

    const dbContent = await nexusDB.getAll<CachedContent>(StoreNames.OFFLINE_CONTENT)
    this.cachedContent = new Map<string, CachedContent>(dbContent.map(c => [c.id, c]))
  }

  private notifyListeners(): void {
    const status = this.getOfflineStatus()
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error: unknown) {
        logger.error('Offline status listener error:', { error })
      }
    })
  }
}

/**
 * 离线内容服务器
 */
class OfflineContentServer {
  private offlineManager: OfflineManager

  constructor(offlineManager: OfflineManager) {
    this.offlineManager = offlineManager
  }

  // 尝试从缓存提供内容
  async serveFromCache(url: string): Promise<any> {
    // 生成缓存键
    const cacheKey = this.generateCacheKey(url)

    // 首先尝试从离线管理器获取
    const cached = this.offlineManager.getCachedContent(cacheKey)
    if (cached) {
      logger.debug('Serving from offline cache:', { url })
      return cached.data
    }

    throw new Error('Content not available offline')
  }

  // 检查内容是否可离线访问
  isContentAvailableOffline(url: string): boolean {
    const cacheKey = this.generateCacheKey(url)

    return this.offlineManager.getCachedContent(cacheKey) !== null
  }

  // 获取离线可用的内容列表
  getAvailableOfflineContent(): Array<{
    url: string
    type: string
    size: number
    timestamp: number
  }> {
    const offlineContent = this.offlineManager.getOfflineAvailableContent()

    return offlineContent.map(content => ({
      url: content.url,
      type: content.type,
      size: content.size,
      timestamp: content.timestamp,
    }))
  }

  private generateCacheKey(url: string): string {
    if (url.startsWith('api:')) return url
    // 简化URL作为缓存键
    return url.replace(/[^a-zA-Z0-9]/g, '_')
  }
}

// 全局实例
export const offlineManager = new OfflineManager()
export const offlineContentServer = new OfflineContentServer(offlineManager)

// 自动启动离线管理
if (typeof window !== 'undefined') {
  // 启动自动同步
  offlineManager.startAutoSync()

  // 定期清理过期内容
  setInterval(
    () => {
      offlineManager.cleanupExpiredContent()
    },
    60 * 60 * 1000
  ) // 每小时清理一次

  // 页面卸载时停止自动同步
  window.addEventListener('beforeunload', () => {
    offlineManager.stopAutoSync()
  })

  // 监听离线状态变化
  offlineManager.addStatusListener(status => {
    logger.info('Offline status changed', status)

    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('offline_status', status.isOnline ? 1 : 0, {
        queuedOperations: status.queuedOperations,
        cachedContent: status.cachedContent,
        offlineDuration: status.offlineDuration,
      })
    }
  })
}
