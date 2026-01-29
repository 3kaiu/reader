/**
 * Offline Manager - 离线功能管理器
 * 提供离线检测、缓存内容服务和离线操作队列
 */

import { networkDetector } from '../network/optimizer'
import { secureRandomString } from '../../utils/secureRandom'
import { nexusDB, StoreNames, type OfflineContent, type SyncTask } from '../../utils/db'
import { syncManager } from '../syncManager'
import { logger } from '../../utils/logger'

// 离线操作接口
export interface OfflineOperation {
  id: string
  type: 'api-request' | 'user-action' | 'sync-data'
  method: string
  url: string
  data?: any
  timestamp: number
  retryCount: number
  maxRetries: number
}

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
  data: any
  timestamp: number
  size: number
  priority: number
}

/**
 * 离线管理器
 */
export class OfflineManager {
  private isOnline = true
  private lastOnlineTime = Date.now()
  private operationQueue: OfflineOperation[] = []
  private cachedContent = new Map<string, CachedContent>()
  private listeners: Array<(status: OfflineStatus) => void> = []
  private syncInterval: number | null = null

  constructor() {
    this.initOfflineDetection()
    // Trigger async load
    this.loadPersistedData().catch(err => console.error('Failed to load offline data', err))
  }

  // 获取离线状态
  getOfflineStatus(): OfflineStatus {
    return {
      isOnline: this.isOnline,
      lastOnlineTime: this.lastOnlineTime,
      offlineDuration: this.isOnline ? 0 : Date.now() - this.lastOnlineTime,
      queuedOperations: this.operationQueue.length,
      cachedContent: this.cachedContent.size
    }
  }

  // 检查是否在线
  isOnlineStatus(): boolean {
    return this.isOnline
  }

  // 添加离线操作到队列
  async queueOperation(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const id = this.generateOperationId()
    const queuedOperation: OfflineOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0
    }

    this.operationQueue.push(queuedOperation)
    await this.persistOperationQueue()

    // 同时添加到全局 SyncManager
    await syncManager.addTask({
      type: operation.type,
      method: operation.method,
      url: operation.url,
      data: operation.data,
      priority: 'NORMAL' // 默认普通优先级
    })

    console.log('📱 Operation queued for offline sync:', queuedOperation.type)
    this.notifyListeners()
  }

  // 缓存内容
  cacheContent(content: Omit<CachedContent, 'timestamp'>): void {
    const cachedItem: CachedContent = {
      ...content,
      timestamp: Date.now()
    }

    this.cachedContent.set(content.id, cachedItem)
    this.persistCachedContent()

    console.log('💾 Content cached for offline access:', content.type, content.id)
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
      filtered = filtered.filter(item =>
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
      console.log(`🧹 Cleaned up ${expiredIds.length} expired cached items`)
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
  }

  // 启动自动同步 (由 SyncManager 接管，此处保留空实现或代理)
  startAutoSync(interval = 30000): void {
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
      console.warn('Cannot precache content while offline')
      return
    }

    console.log(`📦 Precaching ${contentIds.length} important items...`)

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
            priority: 10 // 高优先级
          })
        }
      } catch (error) {
        console.error('Failed to precache content:', id, error)
      }
    }

    console.log('✅ Precaching completed')
  }

  // 导出离线数据
  exportOfflineData(): {
    operations: OfflineOperation[]
    content: CachedContent[]
    status: OfflineStatus
  } {
    return {
      operations: [...this.operationQueue],
      content: Array.from(this.cachedContent.values()),
      status: this.getOfflineStatus()
    }
  }

  // 导入离线数据
  importOfflineData(data: {
    operations?: OfflineOperation[]
    content?: CachedContent[]
  }): void {
    if (data.operations) {
      this.operationQueue = data.operations
      this.persistOperationQueue()
    }

    if (data.content) {
      this.cachedContent.clear()
      data.content.forEach(item => {
        this.cachedContent.set(item.id, item)
      })
      this.persistCachedContent()
    }

    this.notifyListeners()
    console.log('📥 Offline data imported successfully')
  }

  private initOfflineDetection(): void {
    // 监听网络状态变化
    networkDetector.addNetworkChangeListener((info) => {
      const wasOnline = this.isOnline
      this.isOnline = info.isOnline

      if (wasOnline && !this.isOnline) {
        // 刚刚离线
        console.log('📱 Gone offline')
        this.lastOnlineTime = Date.now()
      } else if (!wasOnline && this.isOnline) {
        // 刚刚上线
        console.log('🌐 Back online')
        this.lastOnlineTime = Date.now()

        // 自动同步队列中的操作
        setTimeout(() => {
          this.syncQueuedOperations().catch(console.error)
        }, 1000)
      }

      this.notifyListeners()
    })

    // 初始状态
    this.isOnline = networkDetector.getNetworkInfo().isOnline
  }

  private async executeOperation(operation: OfflineOperation): Promise<any> {
    // 这里应该根据操作类型执行相应的请求
    // 示例实现
    const response = await fetch(operation.url, {
      method: operation.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: operation.data ? JSON.stringify(operation.data) : undefined
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  private async fetchContentForCaching(id: string): Promise<any> {
    // 这里应该实现实际的内容获取逻辑
    // 这里应该实现实际的内容获取逻辑
    // 示例：从API缓存或通用缓存中获取
    // [Refactor] apiCache removed

    // 如果缓存中没有，可能需要从服务器获取
    // 这里返回null表示无法获取
    return null

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
      'chapter': 7 * 24 * 60 * 60 * 1000,      // 7天
      'book': 30 * 24 * 60 * 60 * 1000,        // 30天
      'image': 14 * 24 * 60 * 60 * 1000,       // 14天
      'api-response': 24 * 60 * 60 * 1000       // 1天
    }
    return maxAges[type] || 24 * 60 * 60 * 1000
  }

  private async persistOperationQueue(): Promise<void> {
    try {
      // For simplicity, we can store the whole queue as one entry or map them.
      // StoreNames.SYNC_QUEUE is designed for individual tasks.
      // Let's clear and re-add or just use a single key for the whole queue to minimize complexity for now.
      // To strictly follow the "Unified DB" schema, we should map them.

      const db = await nexusDB.getDB()
      const tx = db.transaction(StoreNames.SYNC_QUEUE, 'readwrite')
      const store = tx.objectStore(StoreNames.SYNC_QUEUE)

      await store.clear()
      for (const op of this.operationQueue) {
        await store.put({
          ...op,
          // Map internal types to DB types if necessary
        })
      }
      await tx.done
    } catch (error) {
      console.error('Failed to persist operation queue:', error)
    }
  }

  private async persistCachedContent(): Promise<void> {
    try {
      const db = await nexusDB.getDB()
      const tx = db.transaction(StoreNames.OFFLINE_CONTENT, 'readwrite')
      const store = tx.objectStore(StoreNames.OFFLINE_CONTENT)

      // Since map can be large, we only put what's new or just clear and put all
      // For a 100MB target, we should avoid clearing all every time.
      // In this refactor, we'll just put all for now as the in-memory cache is the source of truth.
      await store.clear()
      for (const item of this.cachedContent.values()) {
        await store.put(item)
      }
      await tx.done
    } catch (error) {
      console.error('Failed to persist cached content:', error)
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      // 1. Load from IndexedDB
      const dbTasks = await nexusDB.getAll(StoreNames.SYNC_QUEUE)
      this.operationQueue = dbTasks as any

      const dbContent = await nexusDB.getAll(StoreNames.OFFLINE_CONTENT)
      this.cachedContent = new Map(dbContent.map(c => [c.id, c]))

      // 2. Legacy Migration
      const legacyOps = localStorage.getItem('offline_operations')
      if (legacyOps) {
        const parsed = JSON.parse(legacyOps)
        this.operationQueue.push(...parsed)
        localStorage.removeItem('offline_operations')
      }

      const legacyContent = localStorage.getItem('offline_content')
      if (legacyContent) {
        const contentArray: Array<[string, any]> = JSON.parse(legacyContent)
        contentArray.forEach(([id, item]) => {
          if (!this.cachedContent.has(id)) {
            this.cachedContent.set(id, item)
          }
        })
        localStorage.removeItem('offline_content')
      }

      console.log(`📱 Loaded offline data: ${this.operationQueue.length} operations, ${this.cachedContent.size} cached items`)
    } catch (error) {
      console.error('Failed to load persisted offline data:', error)
    }
  }

  private notifyListeners(): void {
    const status = this.getOfflineStatus()
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error) {
        console.error('Offline status listener error:', error)
      }
    })
  }
}

/**
 * 离线内容服务器
 */
export class OfflineContentServer {
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
      console.log('📱 Serving from offline cache:', url)
      return cached.data
    }

    throw new Error('Content not available offline')
  }

  // 检查内容是否可离线访问
  isContentAvailableOffline(url: string): boolean {
    const cacheKey = this.generateCacheKey(url)

    return (
      this.offlineManager.getCachedContent(cacheKey) !== null
    )
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
      timestamp: content.timestamp
    }))
  }

  private generateCacheKey(url: string): string {
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
  setInterval(() => {
    offlineManager.cleanupExpiredContent()
  }, 60 * 60 * 1000) // 每小时清理一次

  // 页面卸载时停止自动同步
  window.addEventListener('beforeunload', () => {
    offlineManager.stopAutoSync()
  })

  // 监听离线状态变化
  offlineManager.addStatusListener((status) => {
    console.log('📱 Offline status changed:', status)

    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('offline_status', status.isOnline ? 1 : 0, {
        queuedOperations: status.queuedOperations,
        cachedContent: status.cachedContent,
        offlineDuration: status.offlineDuration
      })
    }
  })
}

// 工具函数
export function formatOfflineDuration(duration: number): string {
  if (duration < 60000) {
    return '刚刚离线'
  }

  const minutes = Math.floor(duration / 60000)
  if (minutes < 60) {
    return `离线 ${minutes} 分钟`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `离线 ${hours} 小时`
  }

  const days = Math.floor(hours / 24)
  return `离线 ${days} 天`
}

export function getOfflineCapabilities(): {
  canCache: boolean
  canQueue: boolean
  canSync: boolean
  storageAvailable: boolean
} {
  return {
    canCache: 'localStorage' in window,
    canQueue: 'localStorage' in window,
    canSync: 'fetch' in window,
    storageAvailable: 'localStorage' in window && 'sessionStorage' in window
  }
}