/**
 * Offline Service - 离线服务
 * 提供完整的离线功能，包括内容缓存、操作队列和同步管理
 */

import { offlineManager, offlineContentServer, type OfflineStatus } from './manager'
import { networkDetector } from '../network/optimizer'
import { $get, type ApiResponse } from '../../api/client'
import { logger } from '../../utils/logger'

// 离线服务配置
export interface OfflineServiceConfig {
  enableAutoSync: boolean
  syncInterval: number
  maxCacheSize: number
  maxOfflineTime: number
  priorityContent: string[]
  autoPreload: boolean
}

// 离线内容类型
export type OfflineContentType = 'chapter' | 'book' | 'bookmark' | 'reading-progress' | 'user-settings'

// 离线操作类型
export type OfflineOperationType = 'bookmark' | 'progress-update' | 'settings-change' | 'rating' | 'comment'

// 离线内容项
export interface OfflineContentItem {
  id: string
  type: OfflineContentType
  title: string
  url: string
  data: any
  size: number
  lastAccessed: number
  priority: number
  isEssential: boolean
}

// 离线操作项
export interface OfflineOperationItem {
  id: string
  type: OfflineOperationType
  description: string
  data: any
  timestamp: number
  retryCount: number
  isUrgent: boolean
}

// 同步结果
export interface SyncResult {
  success: boolean
  syncedOperations: number
  failedOperations: number
  syncedContent: number
  errors: string[]
  duration: number
}

/**
 * 离线服务类
 */
export class OfflineService {
  private config: OfflineServiceConfig
  private isInitialized = false
  private syncInProgress = false
  private listeners: Array<(status: OfflineStatus) => void> = []

  constructor(config?: Partial<OfflineServiceConfig>) {
    this.config = {
      enableAutoSync: true,
      syncInterval: 30000, // 30秒
      maxCacheSize: 100 * 1024 * 1024, // 100MB
      maxOfflineTime: 7 * 24 * 60 * 60 * 1000, // 7天
      priorityContent: ['reading-progress', 'bookmarks', 'user-settings'],
      autoPreload: true,
      ...config
    }
  }

  // 初始化离线服务
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    logger.info('Initializing offline service...')

    try {
      // 启动离线管理器的自动同步
      if (this.config.enableAutoSync) {
        offlineManager.startAutoSync(this.config.syncInterval)
      }

      // 监听网络状态变化
      networkDetector.addNetworkChangeListener(this.handleNetworkChange.bind(this))

      // 监听离线状态变化
      offlineManager.addStatusListener(this.handleOfflineStatusChange.bind(this))

      // 如果当前在线，执行初始同步
      if (networkDetector.getNetworkInfo().isOnline) {
        await this.performInitialSync()
      }

      // 预加载重要内容
      if (this.config.autoPreload) {
        await this.preloadEssentialContent()
      }

      this.isInitialized = true
      logger.info('Offline service initialized successfully')

    } catch (error) {
      logger.error('Failed to initialize offline service:', error as Error)
      throw error
    }
  }

  // 检查内容是否可离线访问
  isContentAvailableOffline(contentId: string, type: OfflineContentType): boolean {
    const cacheKey = this.generateCacheKey(contentId, type)
    return offlineContentServer.isContentAvailableOffline(cacheKey)
  }

  // 获取离线可用内容列表
  getOfflineContent(): OfflineContentItem[] {
    const availableContent = offlineContentServer.getAvailableOfflineContent()

    return availableContent.map(content => {
      const [contentId, type] = this.parseCacheKey(content.url)
      return {
        id: contentId,
        type: type as OfflineContentType,
        title: this.getContentTitle(contentId, type),
        url: content.url,
        data: null, // 不在列表中加载实际数据
        size: content.size,
        lastAccessed: content.timestamp,
        priority: this.getContentPriority(type),
        isEssential: this.config.priorityContent.includes(type)
      }
    })
  }

  // 缓存内容供离线使用
  async cacheContentForOffline(
    contentId: string,
    type: OfflineContentType,
    priority = 5
  ): Promise<void> {
    try {
      logger.debug(`Caching content for offline: ${type}/${contentId}`)

      const url = this.getContentUrl(contentId, type)
      const response = await $get(url)

      if (response.isSuccess) {
        const cacheKey = this.generateCacheKey(contentId, type)

        offlineManager.cacheContent({
          id: cacheKey,
          type: type as any,
          url,
          data: response.data,
          size: JSON.stringify(response.data).length * 2,
          priority
        })

        logger.debug(`Content cached successfully: ${type}/${contentId}`)
      } else {
        throw new Error(`Failed to fetch content: ${response.errorMsg}`)
      }

    } catch (error) {
      logger.error(`Failed to cache content ${type}/${contentId}:`, error as Error)
      throw error
    }
  }

  // 批量缓存内容
  async batchCacheContent(
    items: Array<{ contentId: string; type: OfflineContentType; priority?: number }>
  ): Promise<{ success: number; failed: number }> {
    logger.info(`Batch caching ${items.length} items...`)

    let success = 0
    let failed = 0

    // 根据网络质量调整并发数
    const networkQuality = networkDetector.getNetworkQuality()
    const concurrency = this.getConcurrencyForNetworkQuality(networkQuality)

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency)

      const batchPromises = batch.map(async (item) => {
        try {
          await this.cacheContentForOffline(item.contentId, item.type, item.priority)
          success++
        } catch (error) {
          logger.warn(`Failed to cache ${item.type}/${item.contentId}:`, error)
          failed++
        }
      })

      await Promise.all(batchPromises)

      // 批次间延迟
      if (i + concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    logger.info(`Batch caching completed: ${success} success, ${failed} failed`)
    return { success, failed }
  }

  // 从离线缓存获取内容
  async getOfflineContent<T>(contentId: string, type: OfflineContentType): Promise<T | null> {
    try {
      const cacheKey = this.generateCacheKey(contentId, type)
      const cached = offlineManager.getCachedContent(cacheKey)

      if (cached) {
        logger.debug(`Serving content from offline cache: ${type}/${contentId}`)
        return cached.data as T
      }

      return null

    } catch (error) {
      logger.error(`Failed to get offline content ${type}/${contentId}:`, error as Error)
      return null
    }
  }

  // 队列离线操作
  queueOfflineOperation(
    type: OfflineOperationType,
    data: any,
    description: string,
    isUrgent = false
  ): void {
    // 根据操作类型确定API端点
    const { method, url } = this.getOperationEndpoint(type, data)

    offlineManager.queueOperation({
      type: 'user-action',
      method,
      url,
      data,
      maxRetries: isUrgent ? 5 : 3
    })

    logger.debug(`Queued offline operation: ${type} - ${description}`)
  }

  // 执行完整同步
  async performFullSync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress')
    }

    if (!networkDetector.getNetworkInfo().isOnline) {
      throw new Error('Cannot sync while offline')
    }

    this.syncInProgress = true
    const startTime = performance.now()

    try {
      logger.info('Starting full sync...')

      // 同步队列中的操作
      await offlineManager.syncQueuedOperations()

      // 更新缓存内容
      await this.updateCachedContent()

      // 清理过期内容
      offlineManager.cleanupExpiredContent(this.config.maxOfflineTime)

      const duration = performance.now() - startTime
      const result: SyncResult = {
        success: true,
        syncedOperations: 0, // 实际数量需要从offlineManager获取
        failedOperations: 0,
        syncedContent: 0,
        errors: [],
        duration
      }

      logger.info(`Full sync completed in ${duration.toFixed(0)}ms`)
      return result

    } catch (error) {
      logger.error('Full sync failed:', error as Error)
      return {
        success: false,
        syncedOperations: 0,
        failedOperations: 0,
        syncedContent: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration: performance.now() - startTime
      }

    } finally {
      this.syncInProgress = false
    }
  }

  // 获取离线服务状态
  getStatus(): OfflineStatus & {
    isInitialized: boolean
    syncInProgress: boolean
    config: OfflineServiceConfig
  } {
    return {
      ...offlineManager.getOfflineStatus(),
      isInitialized: this.isInitialized,
      syncInProgress: this.syncInProgress,
      config: this.config
    }
  }

  // 更新配置
  updateConfig(newConfig: Partial<OfflineServiceConfig>): void {
    this.config = { ...this.config, ...newConfig }

    // 重新配置自动同步
    if (this.config.enableAutoSync) {
      offlineManager.startAutoSync(this.config.syncInterval)
    } else {
      offlineManager.stopAutoSync()
    }

    logger.info('Offline service config updated')
  }

  // 清理离线数据
  async clearOfflineData(): Promise<void> {
    try {
      logger.info('Clearing offline data...')

      // 清空操作队列
      offlineManager.clearQueue?.()

      // 清理缓存内容
      offlineManager.cleanupExpiredContent(0) // 清理所有内容

      // 清理API缓存
      // [Refactor] apiCache cleared

      logger.info('Offline data cleared successfully')

    } catch (error) {
      logger.error('Failed to clear offline data:', error as Error)
      throw error
    }
  }

  // 导出离线数据
  exportOfflineData(): any {
    return offlineManager.exportOfflineData()
  }

  // 导入离线数据
  importOfflineData(data: any): void {
    offlineManager.importOfflineData(data)
  }

  // 添加状态监听器
  addStatusListener(listener: (status: OfflineStatus) => void): void {
    this.listeners.push(listener)
  }

  // 移除状态监听器
  removeStatusListener(listener: (status: OfflineStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  private async performInitialSync(): Promise<void> {
    try {
      logger.debug('Performing initial sync...')

      // 同步用户设置
      await this.syncUserSettings()

      // 同步阅读进度
      await this.syncReadingProgress()

      // 同步书签
      await this.syncBookmarks()

      logger.debug('Initial sync completed')

    } catch (error) {
      logger.warn('Initial sync failed:', error)
    }
  }

  private async preloadEssentialContent(): Promise<void> {
    try {
      logger.debug('Preloading essential content...')

      const essentialItems = [
        { contentId: 'user-settings', type: 'user-settings' as OfflineContentType, priority: 10 },
        { contentId: 'reading-progress', type: 'reading-progress' as OfflineContentType, priority: 9 },
        { contentId: 'bookmarks', type: 'bookmark' as OfflineContentType, priority: 8 }
      ]

      await this.batchCacheContent(essentialItems)

      logger.debug('Essential content preloaded')

    } catch (error) {
      logger.warn('Failed to preload essential content:', error)
    }
  }

  private async updateCachedContent(): Promise<void> {
    // 更新已缓存的内容
    const offlineContent = this.getOfflineContent()

    for (const item of offlineContent) {
      if (item.isEssential) {
        try {
          await this.cacheContentForOffline(item.id, item.type, item.priority)
        } catch (error) {
          logger.warn(`Failed to update cached content ${item.type}/${item.id}:`, error)
        }
      }
    }
  }

  private async syncUserSettings(): Promise<void> {
    // 实现用户设置同步逻辑
    // 这里应该调用实际的API
  }

  private async syncReadingProgress(): Promise<void> {
    // 实现阅读进度同步逻辑
    // 这里应该调用实际的API
  }

  private async syncBookmarks(): Promise<void> {
    // 实现书签同步逻辑
    // 这里应该调用实际的API
  }

  private handleNetworkChange(networkInfo: any): void {
    logger.debug('Network changed in offline service')

    if (networkInfo.isOnline && this.config.enableAutoSync) {
      // 网络恢复时自动同步
      setTimeout(() => {
        this.performFullSync().catch(console.error)
      }, 1000)
    }
  }

  private handleOfflineStatusChange(status: OfflineStatus): void {
    // 通知所有监听器
    this.listeners.forEach(listener => {
      try {
        listener(status)
      } catch (error) {
        logger.error('Offline status listener error:', error as Error)
      }
    })
  }

  private generateCacheKey(contentId: string, type: OfflineContentType): string {
    return `offline_${type}_${contentId}`
  }

  private parseCacheKey(cacheKey: string): [string, string] {
    const parts = cacheKey.split('_')
    if (parts.length >= 3 && parts[0] === 'offline') {
      return [parts.slice(2).join('_'), parts[1]]
    }
    return [cacheKey, 'unknown']
  }

  private getContentUrl(contentId: string, type: OfflineContentType): string {
    const urlMap = {
      'chapter': `/chapters/${contentId}`,
      'book': `/books/${contentId}`,
      'bookmark': `/bookmarks/${contentId}`,
      'reading-progress': `/progress/${contentId}`,
      'user-settings': `/settings/${contentId}`
    }
    return urlMap[type] || `/content/${contentId}`
  }

  private getContentTitle(contentId: string, type: string): string {
    const titleMap = {
      'chapter': `章节 ${contentId}`,
      'book': `书籍 ${contentId}`,
      'bookmark': `书签 ${contentId}`,
      'reading-progress': `阅读进度 ${contentId}`,
      'user-settings': `用户设置 ${contentId}`
    }
    return titleMap[type] || `内容 ${contentId}`
  }

  private getContentPriority(type: string): number {
    const priorityMap = {
      'user-settings': 10,
      'reading-progress': 9,
      'bookmark': 8,
      'chapter': 7,
      'book': 6
    }
    return priorityMap[type] || 5
  }

  private getOperationEndpoint(type: OfflineOperationType, data: any): { method: string; url: string } {
    const endpointMap = {
      'bookmark': { method: 'POST', url: '/bookmarks' },
      'progress-update': { method: 'PATCH', url: `/progress/${data.chapterId}` },
      'settings-change': { method: 'PATCH', url: '/settings' },
      'rating': { method: 'POST', url: '/ratings' },
      'comment': { method: 'POST', url: '/comments' }
    }
    return endpointMap[type] || { method: 'POST', url: '/operations' }
  }

  private getConcurrencyForNetworkQuality(networkQuality: string): number {
    const concurrencyMap = {
      'excellent': 5,
      'good': 4,
      'fair': 3,
      'poor': 2,
      'offline': 1
    }
    return concurrencyMap[networkQuality as keyof typeof concurrencyMap] || 3
  }
}

// 全局离线服务实例
export const offlineService = new OfflineService()

// 自动初始化
if (typeof window !== 'undefined') {
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      offlineService.initialize().catch(console.error)
    })
  } else {
    offlineService.initialize().catch(console.error)
  }

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    // 执行清理操作
  })
}

// 便捷函数
export function isOfflineContentAvailable(contentId: string, type: OfflineContentType): boolean {
  return offlineService.isContentAvailableOffline(contentId, type)
}

export function cacheForOffline(contentId: string, type: OfflineContentType, priority?: number): Promise<void> {
  return offlineService.cacheContentForOffline(contentId, type, priority)
}

export function getFromOfflineCache<T>(contentId: string, type: OfflineContentType): Promise<T | null> {
  return offlineService.getOfflineContent<T>(contentId, type)
}

export function queueOfflineAction(
  type: OfflineOperationType,
  data: any,
  description: string,
  isUrgent = false
): void {
  offlineService.queueOfflineOperation(type, data, description, isUrgent)
}

export function syncOfflineData(): Promise<SyncResult> {
  return offlineService.performFullSync()
}