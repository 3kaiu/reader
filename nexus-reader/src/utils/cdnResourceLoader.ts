/**
 * CDN资源加载策略 - 端侧AI优化
 * 实现智能CDN选择、资源完整性验证和降级机制
 */

import { getCDNResource, checkCDNAvailability, type CDNResource } from '@/config/cdnResources'
import { dynamicLoader } from './dynamicLoader'

export interface CDNLoadOptions {
  timeout?: number
  retries?: number
  integrity?: boolean
  fallbackToLocal?: boolean
  onProgress?: (progress: { loaded: number; total: number; percentage: number; status: string }) => void
}

export interface CDNHealthStatus {
  url: string
  available: boolean
  responseTime: number
  lastChecked: number
}

/**
 * CDN资源加载器
 */
export class CDNResourceLoader {
  private static instance: CDNResourceLoader
  private healthCache = new Map<string, CDNHealthStatus>()
  private readonly HEALTH_CACHE_TTL = 5 * 60 * 1000 // 5分钟
  private readonly DEFAULT_TIMEOUT = 10000 // 10秒

  private constructor() {}

  static getInstance(): CDNResourceLoader {
    if (!CDNResourceLoader.instance) {
      CDNResourceLoader.instance = new CDNResourceLoader()
    }
    return CDNResourceLoader.instance
  }

  /**
   * 加载CDN资源
   */
  async loadResource(packageName: string, options: CDNLoadOptions = {}): Promise<any> {
    const cdnResource = getCDNResource(packageName)
    if (!cdnResource) {
      throw new Error(`No CDN configuration found for package: ${packageName}`)
    }

    // 获取最佳CDN URL
    const bestUrl = await this.selectBestCDN(cdnResource, options)
    
    try {
      // 使用动态加载器加载资源
      const result = await dynamicLoader.loadLibrary(packageName, {
        timeout: options.timeout || this.DEFAULT_TIMEOUT,
        retries: options.retries || 2,
        onProgress: options.onProgress,
        integrity: options.integrity ? cdnResource.integrity : undefined
      })

      // 更新CDN健康状态
      this.updateHealthStatus(bestUrl, true, Date.now())
      
      return result
    } catch (error) {
      // 更新CDN健康状态
      this.updateHealthStatus(bestUrl, false, Date.now())
      
      // 尝试降级策略
      if (options.fallbackToLocal) {
        return this.tryLocalFallback(packageName, error as Error)
      }
      
      throw error
    }
  }

  /**
   * 预加载CDN资源
   */
  async preloadResources(packageNames: string[], options: CDNLoadOptions = {}): Promise<void> {
    const preloadPromises = packageNames.map(async (packageName) => {
      try {
        await this.loadResource(packageName, {
          ...options,
          onProgress: (progress) => {
            options.onProgress?.({
              ...progress,
              status: `Preloading ${packageName}: ${progress.status}`
            })
          }
        })
      } catch (error) {
        console.warn(`Failed to preload ${packageName}:`, error)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * 检查CDN健康状态
   */
  async checkCDNHealth(urls: string[]): Promise<CDNHealthStatus[]> {
    const healthPromises = urls.map(async (url) => {
      const cached = this.healthCache.get(url)
      
      // 如果缓存有效，直接返回
      if (cached && Date.now() - cached.lastChecked < this.HEALTH_CACHE_TTL) {
        return cached
      }

      // 检查CDN可用性
      const startTime = Date.now()
      try {
        const available = await checkCDNAvailability(url)
        const responseTime = Date.now() - startTime
        
        const status: CDNHealthStatus = {
          url,
          available,
          responseTime,
          lastChecked: Date.now()
        }
        
        this.healthCache.set(url, status)
        return status
      } catch (error) {
        const status: CDNHealthStatus = {
          url,
          available: false,
          responseTime: Date.now() - startTime,
          lastChecked: Date.now()
        }
        
        this.healthCache.set(url, status)
        return status
      }
    })

    return Promise.all(healthPromises)
  }

  /**
   * 获取CDN性能报告
   */
  getCDNPerformanceReport(): Record<string, CDNHealthStatus> {
    const report: Record<string, CDNHealthStatus> = {}
    
    for (const [url, status] of this.healthCache.entries()) {
      report[url] = { ...status }
    }
    
    return report
  }

  /**
   * 清理健康状态缓存
   */
  clearHealthCache(): void {
    this.healthCache.clear()
  }

  /**
   * 验证资源完整性
   */
  async verifyIntegrity(data: ArrayBuffer, expectedHash?: string): Promise<boolean> {
    if (!expectedHash) {
      return true // 如果没有提供哈希，跳过验证
    }

    try {
      // 使用Web Crypto API计算SHA-256哈希
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      return hashHex === expectedHash.toLowerCase()
    } catch (error) {
      console.warn('Failed to verify resource integrity:', error)
      return false
    }
  }

  // 私有方法

  /**
   * 选择最佳CDN
   */
  private async selectBestCDN(cdnResource: CDNResource, options: CDNLoadOptions): Promise<string> {
    const urls = [cdnResource.url, ...(cdnResource.fallback || [])]
    
    // 如果只有一个URL，直接返回
    if (urls.length === 1) {
      return urls[0]
    }

    // 检查所有CDN的健康状态
    const healthStatuses = await this.checkCDNHealth(urls)
    
    // 选择最佳CDN（可用且响应时间最短）
    const availableCDNs = healthStatuses
      .filter(status => status.available)
      .sort((a, b) => a.responseTime - b.responseTime)

    if (availableCDNs.length === 0) {
      // 如果没有可用的CDN，返回主URL（让后续错误处理）
      return cdnResource.url
    }

    return availableCDNs[0].url
  }

  /**
   * 更新CDN健康状态
   */
  private updateHealthStatus(url: string, available: boolean, timestamp: number): void {
    const existing = this.healthCache.get(url)
    
    this.healthCache.set(url, {
      url,
      available,
      responseTime: existing?.responseTime || 0,
      lastChecked: timestamp
    })
  }

  /**
   * 尝试本地降级
   */
  private async tryLocalFallback(packageName: string, originalError: Error): Promise<any> {
    console.warn(`CDN loading failed for ${packageName}, attempting local fallback:`, originalError)
    
    // 尝试从本地缓存加载
    const cached = await dynamicLoader.checkCache(packageName)
    if (cached) {
      console.info(`Using cached version of ${packageName}`)
      // 这里需要实际的缓存获取逻辑
      return null // 占位符
    }

    // 如果有本地版本，尝试加载
    try {
      // 这里可以实现本地版本的加载逻辑
      // 例如从 /assets/libs/ 目录加载
      const localUrl = `/assets/libs/${packageName}.js`
      return await dynamicLoader.loadLibrary(packageName, { 
        timeout: 5000,
        retries: 1 
      })
    } catch (localError) {
      console.error(`Local fallback also failed for ${packageName}:`, localError)
      throw new Error(`Both CDN and local loading failed for ${packageName}: ${originalError.message}`)
    }
  }
}

/**
 * CDN资源预加载管理器
 */
export class CDNPreloadManager {
  private static instance: CDNPreloadManager
  private preloadQueue: string[] = []
  private preloading = false
  private preloadedResources = new Set<string>()

  private constructor() {}

  static getInstance(): CDNPreloadManager {
    if (!CDNPreloadManager.instance) {
      CDNPreloadManager.instance = new CDNPreloadManager()
    }
    return CDNPreloadManager.instance
  }

  /**
   * 添加到预加载队列
   */
  addToQueue(packageNames: string | string[]): void {
    const names = Array.isArray(packageNames) ? packageNames : [packageNames]
    
    for (const name of names) {
      if (!this.preloadedResources.has(name) && !this.preloadQueue.includes(name)) {
        this.preloadQueue.push(name)
      }
    }
  }

  /**
   * 开始预加载
   */
  async startPreloading(options: CDNLoadOptions = {}): Promise<void> {
    if (this.preloading || this.preloadQueue.length === 0) {
      return
    }

    this.preloading = true
    const loader = CDNResourceLoader.getInstance()

    try {
      while (this.preloadQueue.length > 0) {
        const packageName = this.preloadQueue.shift()!
        
        try {
          await loader.loadResource(packageName, {
            ...options,
            onProgress: (progress) => {
              options.onProgress?.({
                ...progress,
                status: `Preloading ${packageName}: ${progress.status}`
              })
            }
          })
          
          this.preloadedResources.add(packageName)
          console.info(`Successfully preloaded ${packageName}`)
        } catch (error) {
          console.warn(`Failed to preload ${packageName}:`, error)
        }
      }
    } finally {
      this.preloading = false
    }
  }

  /**
   * 检查资源是否已预加载
   */
  isPreloaded(packageName: string): boolean {
    return this.preloadedResources.has(packageName)
  }

  /**
   * 获取预加载状态
   */
  getPreloadStatus(): { 
    queue: string[]
    preloaded: string[]
    isPreloading: boolean 
  } {
    return {
      queue: [...this.preloadQueue],
      preloaded: Array.from(this.preloadedResources),
      isPreloading: this.preloading
    }
  }

  /**
   * 清理预加载状态
   */
  clear(): void {
    this.preloadQueue = []
    this.preloadedResources.clear()
    this.preloading = false
  }
}

// 导出单例实例
export const cdnResourceLoader = CDNResourceLoader.getInstance()
export const cdnPreloadManager = CDNPreloadManager.getInstance()