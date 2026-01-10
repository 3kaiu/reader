/**
 * Cache Manager - 缓存管理工具
 * 提供智能缓存管理、LRU 淘汰策略和跨标签页同步
 */

// 缓存配置
export interface CacheConfig {
  maxSize: number        // 最大缓存大小 (MB)
  maxItems: number       // 最大缓存项数
  ttl: number           // 生存时间 (ms)
  strategy: 'lru' | 'lfu' | 'fifo'  // 淘汰策略
}

// 缓存项接口
export interface CacheItem<T = any> {
  key: string
  value: T
  timestamp: number
  accessCount: number
  size: number
  ttl?: number
}

// 缓存统计信息
export interface CacheStats {
  totalItems: number
  totalSize: number
  hitRate: number
  missRate: number
  evictionCount: number
}

// 默认配置
const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 50,           // 50MB
  maxItems: 1000,        // 1000项
  ttl: 30 * 60 * 1000,   // 30分钟
  strategy: 'lru'
}

// 图片缓存配置
const IMAGE_CACHE_CONFIG: CacheConfig = {
  maxSize: 100,          // 100MB
  maxItems: 500,         // 500张图片
  ttl: 24 * 60 * 60 * 1000, // 24小时
  strategy: 'lru'
}

// API 缓存配置
const API_CACHE_CONFIG: CacheConfig = {
  maxSize: 20,           // 20MB
  maxItems: 200,         // 200个请求
  ttl: 5 * 60 * 1000,    // 5分钟
  strategy: 'lru'
}

/**
 * 内存缓存管理器
 */
export class MemoryCache<T = any> {
  private cache = new Map<string, CacheItem<T>>()
  private accessOrder: string[] = []
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  }

  constructor(private config: CacheConfig = DEFAULT_CONFIG) {}

  // 获取缓存项
  get(key: string): T | null {
    const item = this.cache.get(key)
    
    if (!item) {
      this.stats.misses++
      return null
    }

    // 检查是否过期
    const now = Date.now()
    const itemTtl = item.ttl || this.config.ttl
    if (now - item.timestamp > itemTtl) {
      this.delete(key)
      this.stats.misses++
      return null
    }

    // 更新访问信息
    item.accessCount++
    this.updateAccessOrder(key)
    this.stats.hits++
    
    return item.value
  }

  // 设置缓存项
  set(key: string, value: T, ttl?: number): void {
    const size = this.calculateSize(value)
    const now = Date.now()

    // 检查是否需要淘汰
    this.evictIfNeeded(size)

    const item: CacheItem<T> = {
      key,
      value,
      timestamp: now,
      accessCount: 1,
      size,
      ttl
    }

    this.cache.set(key, item)
    this.updateAccessOrder(key)

    // 触发跨标签页同步
    this.broadcastCacheUpdate(key, 'set')
  }

  // 删除缓存项
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.removeFromAccessOrder(key)
      this.broadcastCacheUpdate(key, 'delete')
    }
    return deleted
  }

  // 清空缓存
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.stats = { hits: 0, misses: 0, evictions: 0 }
    this.broadcastCacheUpdate('*', 'clear')
  }

  // 获取缓存统计
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses
    return {
      totalItems: this.cache.size,
      totalSize: this.getTotalSize(),
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      evictionCount: this.stats.evictions
    }
  }

  // 获取所有键
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  // 检查是否存在
  has(key: string): boolean {
    return this.cache.has(key) && this.get(key) !== null
  }

  // 获取缓存大小
  size(): number {
    return this.cache.size
  }

  // 淘汰策略
  private evictIfNeeded(newItemSize: number): void {
    // 检查项数限制
    while (this.cache.size >= this.config.maxItems) {
      this.evictOne()
    }

    // 检查大小限制
    const totalSize = this.getTotalSize()
    const maxSizeBytes = this.config.maxSize * 1024 * 1024
    
    while (totalSize + newItemSize > maxSizeBytes && this.cache.size > 0) {
      this.evictOne()
    }
  }

  private evictOne(): void {
    let keyToEvict: string | null = null

    switch (this.config.strategy) {
      case 'lru':
        keyToEvict = this.accessOrder[0] || null
        break
      case 'lfu':
        keyToEvict = this.findLFUKey()
        break
      case 'fifo':
        keyToEvict = this.cache.keys().next().value || null
        break
    }

    if (keyToEvict) {
      this.delete(keyToEvict)
      this.stats.evictions++
    }
  }

  private findLFUKey(): string | null {
    let minAccessCount = Infinity
    let lfuKey: string | null = null

    for (const [key, item] of this.cache) {
      if (item.accessCount < minAccessCount) {
        minAccessCount = item.accessCount
        lfuKey = key
      }
    }

    return lfuKey
  }

  private updateAccessOrder(key: string): void {
    // 移除旧位置
    this.removeFromAccessOrder(key)
    // 添加到末尾
    this.accessOrder.push(key)
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  private getTotalSize(): number {
    let total = 0
    for (const item of this.cache.values()) {
      total += item.size
    }
    return total
  }

  private calculateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2 // UTF-16
    }
    if (value instanceof ArrayBuffer) {
      return value.byteLength
    }
    if (value instanceof Blob) {
      return value.size
    }
    // 估算对象大小
    return JSON.stringify(value).length * 2
  }

  private broadcastCacheUpdate(key: string, action: 'set' | 'delete' | 'clear'): void {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('cache-sync')
      channel.postMessage({
        type: 'cache-update',
        cacheName: this.constructor.name,
        key,
        action,
        timestamp: Date.now()
      })
    }
  }
}

/**
 * Service Worker 缓存管理器
 */
export class ServiceWorkerCacheManager {
  private registration: ServiceWorkerRegistration | null = null

  constructor() {
    this.initServiceWorker()
  }

  private async initServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.register('/sw.js')
        console.log('Service Worker registered successfully')

        // 监听更新
        this.registration.addEventListener('updatefound', () => {
          const newWorker = this.registration!.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 有新版本可用
                this.notifyUpdate()
              }
            })
          }
        })
      } catch (error) {
        console.error('Service Worker registration failed:', error)
      }
    }
  }

  // 获取缓存统计
  async getCacheStats(): Promise<any> {
    if (!this.registration) return null

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_STATS') {
          resolve(event.data.payload)
        }
      }

      navigator.serviceWorker.controller?.postMessage(
        { type: 'GET_CACHE_STATS' },
        [channel.port2]
      )
    })
  }

  // 清理缓存
  async clearCache(cacheName?: string): Promise<void> {
    if (!this.registration) return

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_CLEARED') {
          resolve()
        }
      }

      navigator.serviceWorker.controller?.postMessage(
        { type: 'CLEAR_CACHE', payload: { cacheName } },
        [channel.port2]
      )
    })
  }

  // 预缓存 URL
  async precacheUrls(urls: string[]): Promise<void> {
    if (!this.registration) return

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        if (event.data.type === 'PRECACHE_COMPLETED') {
          resolve()
        }
      }

      navigator.serviceWorker.controller?.postMessage(
        { type: 'PRECACHE_URLS', payload: { urls } },
        [channel.port2]
      )
    })
  }

  private notifyUpdate(): void {
    // 通知用户有新版本
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('应用更新', {
        body: '有新版本可用，刷新页面以获取最新功能',
        icon: '/favicon.png'
      })
    }
  }
}

/**
 * 跨标签页缓存同步管理器
 */
export class CrossTabCacheSync {
  private channel: BroadcastChannel | null = null
  private caches = new Map<string, MemoryCache>()

  constructor() {
    this.initBroadcastChannel()
  }

  private initBroadcastChannel(): void {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('cache-sync')
      this.channel.addEventListener('message', this.handleMessage.bind(this))
    }
  }

  registerCache(name: string, cache: MemoryCache): void {
    this.caches.set(name, cache)
  }

  private handleMessage(event: MessageEvent): void {
    const { type, cacheName, key, action } = event.data

    if (type === 'cache-update') {
      const cache = this.caches.get(cacheName)
      if (cache) {
        switch (action) {
          case 'delete':
            cache.delete(key)
            break
          case 'clear':
            cache.clear()
            break
          // set 操作不同步，避免循环
        }
      }
    }
  }

  destroy(): void {
    this.channel?.close()
  }
}

// 全局缓存实例
export const imageCache = new MemoryCache<string>(IMAGE_CACHE_CONFIG)
export const apiCache = new MemoryCache<any>(API_CACHE_CONFIG)
export const generalCache = new MemoryCache<any>(DEFAULT_CONFIG)

// Service Worker 缓存管理器
export const swCacheManager = new ServiceWorkerCacheManager()

// 跨标签页同步
export const crossTabSync = new CrossTabCacheSync()
crossTabSync.registerCache('MemoryCache', imageCache)
crossTabSync.registerCache('MemoryCache', apiCache)
crossTabSync.registerCache('MemoryCache', generalCache)

// 缓存工具函数
export function createCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`
}

export function isCacheSupported(): boolean {
  return 'caches' in window && 'serviceWorker' in navigator
}

// 清理过期缓存
export function cleanupExpiredCaches(): void {
  const caches = [imageCache, apiCache, generalCache]
  caches.forEach(cache => {
    const keys = cache.keys()
    keys.forEach(key => {
      // 触发 get 操作来检查过期
      cache.get(key)
    })
  })
}

// 定期清理（每10分钟）
setInterval(cleanupExpiredCaches, 10 * 60 * 1000)

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  crossTabSync.destroy()
})