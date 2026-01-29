/**
 * Network Optimizer - 网络优化工具
 * 提供自适应图片质量、请求优化和网络条件检测
 */

// 网络连接信息接口
export interface NetworkInfo {
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g' | 'unknown'
  downlink: number        // 下行带宽 (Mbps)
  rtt: number            // 往返时间 (ms)
  saveData: boolean      // 用户是否启用了数据节省模式
  isOnline: boolean      // 是否在线
  connectionType: string // 连接类型
}

// 图片质量配置
export interface ImageQualityConfig {
  quality: number        // 图片质量 (0-100)
  maxWidth: number       // 最大宽度
  maxHeight: number      // 最大高度
  format: 'webp' | 'jpeg' | 'png' | 'auto'
  progressive: boolean   // 是否使用渐进式加载
}

// 请求优化配置
export interface RequestOptimizationConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  jitterFactor: number
  batchSize: number
  batchDelay: number
  timeout: number
}

// 网络质量等级
export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline'

// CORS 缓存头（静态优化）
const STATIC_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
}

// 默认图片质量配置
const IMAGE_QUALITY_CONFIGS: Record<NetworkQuality, ImageQualityConfig> = {
  excellent: {
    quality: 95,
    maxWidth: 2048,
    maxHeight: 2048,
    format: 'webp',
    progressive: true
  },
  good: {
    quality: 85,
    maxWidth: 1536,
    maxHeight: 1536,
    format: 'webp',
    progressive: true
  },
  fair: {
    quality: 75,
    maxWidth: 1024,
    maxHeight: 1024,
    format: 'webp',
    progressive: false
  },
  poor: {
    quality: 60,
    maxWidth: 768,
    maxHeight: 768,
    format: 'jpeg',
    progressive: false
  },
  offline: {
    quality: 50,
    maxWidth: 512,
    maxHeight: 512,
    format: 'jpeg',
    progressive: false
  }
}

// 默认请求优化配置
const REQUEST_OPTIMIZATION_CONFIGS: Record<NetworkQuality, RequestOptimizationConfig> = {
  excellent: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
    jitterFactor: 0.1,
    batchSize: 10,
    batchDelay: 50,
    timeout: 10000
  },
  good: {
    maxRetries: 3,
    baseDelay: 200,
    maxDelay: 3000,
    jitterFactor: 0.2,
    batchSize: 8,
    batchDelay: 100,
    timeout: 15000
  },
  fair: {
    maxRetries: 4,
    baseDelay: 500,
    maxDelay: 5000,
    jitterFactor: 0.3,
    batchSize: 5,
    batchDelay: 200,
    timeout: 20000
  },
  poor: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 8000,
    jitterFactor: 0.4,
    batchSize: 3,
    batchDelay: 500,
    timeout: 30000
  },
  offline: {
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    jitterFactor: 0,
    batchSize: 1,
    batchDelay: 0,
    timeout: 5000
  }
}

/**
 * 网络条件检测器
 */
export class NetworkDetector {
  private networkInfo: NetworkInfo | null = null
  private listeners: Array<(info: NetworkInfo) => void> = []
  private updateInterval: number | null = null

  constructor() {
    this.initNetworkDetection()
  }

  // 获取当前网络信息
  getNetworkInfo(): NetworkInfo {
    if (this.networkInfo) {
      return this.networkInfo
    }

    // 降级检测
    return this.getFallbackNetworkInfo()
  }

  // 检查是否在线
  isOnline(): boolean {
    return this.getNetworkInfo().isOnline
  }

  // 获取网络质量等级
  getNetworkQuality(): NetworkQuality {
    const info = this.getNetworkInfo()

    if (!info.isOnline) {
      return 'offline'
    }

    if (info.saveData) {
      return 'poor'
    }

    switch (info.effectiveType) {
      case 'slow-2g':
        return 'poor'
      case '2g':
        return 'poor'
      case '3g':
        return 'fair'
      case '4g':
        return info.downlink > 10 ? 'excellent' : 'good'
      default:
        // 基于 RTT 和带宽判断
        if (info.rtt < 100 && info.downlink > 10) {
          return 'excellent'
        } else if (info.rtt < 300 && info.downlink > 5) {
          return 'good'
        } else if (info.rtt < 500 && info.downlink > 1) {
          return 'fair'
        } else {
          return 'poor'
        }
    }
  }

  // 添加网络变化监听器
  addNetworkChangeListener(listener: (info: NetworkInfo) => void): void {
    this.listeners.push(listener)
  }

  // 移除网络变化监听器
  removeNetworkChangeListener(listener: (info: NetworkInfo) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 开始监控网络变化 (性能优化：废弃定时轮询，全由系统事件驱动)
  startMonitoring(): void {
    console.log('🌐 Network monitoring started (Event-driven)')
  }

  // 停止监控网络变化
  stopMonitoring(): void {
    if (this.updateInterval && typeof window !== 'undefined') {
      clearInterval(this.updateInterval)
      this.updateInterval = null
      console.log('🌐 Network monitoring stopped')
    }
  }

  private initNetworkDetection(): void {
    this.networkInfo = this.detectNetworkInfo()

    // 只在浏览器环境中添加事件监听器
    if (typeof window !== 'undefined') {
      // 监听在线/离线状态变化
      window.addEventListener('online', this.handleOnlineStatusChange.bind(this))
      window.addEventListener('offline', this.handleOnlineStatusChange.bind(this))

      // 监听连接变化（如果支持）
      if ('connection' in navigator) {
        const connection = (navigator as any).connection
        if (connection && typeof connection.addEventListener === 'function') {
          connection.addEventListener('change', this.handleConnectionChange.bind(this))
        }
      }
    }
  }

  private detectNetworkInfo(): NetworkInfo {
    const connection = (navigator as any).connection
    const isOnline = navigator.onLine

    if (connection) {
      return {
        effectiveType: connection.effectiveType || 'unknown',
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
        saveData: connection.saveData || false,
        isOnline,
        connectionType: connection.type || 'unknown'
      }
    }

    return this.getFallbackNetworkInfo()
  }

  private getFallbackNetworkInfo(): NetworkInfo {
    return {
      effectiveType: 'unknown',
      downlink: 0,
      rtt: 0,
      saveData: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connectionType: 'unknown'
    }
  }

  private hasNetworkChanged(newInfo: NetworkInfo): boolean {
    if (!this.networkInfo) return true

    return (
      this.networkInfo.effectiveType !== newInfo.effectiveType ||
      this.networkInfo.isOnline !== newInfo.isOnline ||
      this.networkInfo.saveData !== newInfo.saveData ||
      Math.abs(this.networkInfo.downlink - newInfo.downlink) > 1 ||
      Math.abs(this.networkInfo.rtt - newInfo.rtt) > 50
    )
  }

  private handleOnlineStatusChange(): void {
    const newInfo = this.detectNetworkInfo()
    this.networkInfo = newInfo
    this.notifyListeners(newInfo)
  }

  private handleConnectionChange(): void {
    const newInfo = this.detectNetworkInfo()
    if (this.hasNetworkChanged(newInfo)) {
      this.networkInfo = newInfo
      this.notifyListeners(newInfo)
    }
  }

  private notifyListeners(info: NetworkInfo): void {
    this.listeners.forEach(listener => {
      try {
        listener(info)
      } catch (error) {
        console.error('Network change listener error:', error)
      }
    })
  }
}

/**
 * 自适应图片质量管理器
 */
export class AdaptiveImageQuality {
  private networkDetector: NetworkDetector
  private currentQuality: NetworkQuality = 'good'

  constructor(networkDetector: NetworkDetector) {
    this.networkDetector = networkDetector
    this.currentQuality = networkDetector.getNetworkQuality()

    // 监听网络变化
    networkDetector.addNetworkChangeListener((info) => {
      const newQuality = networkDetector.getNetworkQuality()
      if (newQuality !== this.currentQuality) {
        this.currentQuality = newQuality
        console.log(`📱 Image quality adjusted to: ${newQuality}`)
      }
    })
  }

  // 获取当前图片质量配置
  getCurrentConfig(): ImageQualityConfig {
    return IMAGE_QUALITY_CONFIGS[this.currentQuality]
  }

  // 优化图片URL
  optimizeImageUrl(originalUrl: string, options?: Partial<ImageQualityConfig>): string {
    const config = { ...this.getCurrentConfig(), ...options }

    // 如果是本地图片或已经优化过的图片，直接返回
    if (originalUrl.startsWith('data:') || originalUrl.includes('quality=')) {
      return originalUrl
    }

    // 构建优化参数
    const params = new URLSearchParams()
    params.set('quality', config.quality.toString())
    params.set('w', config.maxWidth.toString())
    params.set('h', config.maxHeight.toString())
    params.set('format', config.format === 'auto' ? 'webp' : config.format)

    if (config.progressive) {
      params.set('progressive', 'true')
    }

    // 如果URL已有参数，添加到现有参数中
    const separator = originalUrl.includes('?') ? '&' : '?'
    return `${originalUrl}${separator}${params.toString()}`
  }

  // 预加载图片
  async preloadImage(url: string, options?: Partial<ImageQualityConfig>): Promise<HTMLImageElement> {
    const optimizedUrl = this.optimizeImageUrl(url, options)

    return new Promise((resolve, reject) => {
      const img = new Image()

      const timeout = setTimeout(() => {
        reject(new Error('Image preload timeout'))
      }, 10000)

      img.onload = () => {
        clearTimeout(timeout)
        resolve(img)
      }

      img.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Image preload failed'))
      }

      img.src = optimizedUrl
    })
  }

  // 批量预加载图片
  async preloadImages(urls: string[], options?: Partial<ImageQualityConfig>): Promise<HTMLImageElement[]> {
    const config = this.networkDetector.getNetworkInfo()
    const batchSize = config.effectiveType === 'slow-2g' || config.effectiveType === '2g' ? 2 : 5

    const results: HTMLImageElement[] = []

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize)
      const batchPromises = batch.map(url =>
        this.preloadImage(url, options).catch(error => {
          console.warn('Failed to preload image:', url, error)
          return null
        })
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults.filter(img => img !== null) as HTMLImageElement[])

      // 在批次之间添加延迟，避免网络拥塞
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return results
  }
}

/**
 * 请求优化器
 */
export class RequestOptimizer {
  private networkDetector: NetworkDetector
  private requestQueue: Array<() => Promise<any>> = []
  private isProcessingQueue = false
  private pendingRequests = new Map<string, Promise<any>>()

  constructor(networkDetector: NetworkDetector) {
    this.networkDetector = networkDetector
  }

  // 带重试的请求
  async requestWithRetry<T>(
    requestFn: () => Promise<T>,
    options?: Partial<RequestOptimizationConfig>
  ): Promise<T> {
    const networkQuality = this.networkDetector.getNetworkQuality()
    const config = { ...REQUEST_OPTIMIZATION_CONFIGS[networkQuality], ...options }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // 添加超时控制
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), config.timeout)
        })

        const result = await Promise.race([requestFn(), timeoutPromise])

        // 成功时报告性能指标
        if (window.performanceMonitor) {
          window.performanceMonitor.reportMetric('request_retry_success', attempt, {
            networkQuality,
            totalAttempts: attempt + 1
          })
        }

        return result
      } catch (error) {
        lastError = error as Error

        // 最后一次尝试失败
        if (attempt === config.maxRetries) {
          if (window.performanceMonitor) {
            window.performanceMonitor.reportMetric('request_retry_failed', config.maxRetries, {
              networkQuality,
              error: lastError.message
            })
          }
          break
        }

        // 计算延迟时间（指数退避 + 抖动）
        const baseDelay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay)
        const jitter = baseDelay * config.jitterFactor * Math.random()
        const delay = baseDelay + jitter

        console.log(`🔄 Request failed (attempt ${attempt + 1}), retrying in ${delay.toFixed(0)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Request failed after all retries')
  }

  // 请求去重
  async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // 如果已有相同的请求在进行中，返回该请求的Promise
    if (this.pendingRequests.has(key)) {
      console.log(`🔄 Request deduplicated: ${key}`)
      return this.pendingRequests.get(key) as Promise<T>
    }

    // 创建新请求
    const requestPromise = this.requestWithRetry(requestFn)
      .finally(() => {
        // 请求完成后从pending列表中移除
        this.pendingRequests.delete(key)
      })

    this.pendingRequests.set(key, requestPromise)
    return requestPromise
  }

  // 批量请求
  async batchRequests<T>(
    requests: Array<() => Promise<T>>,
    options?: Partial<RequestOptimizationConfig>
  ): Promise<T[]> {
    const networkQuality = this.networkDetector.getNetworkQuality()
    const config = { ...REQUEST_OPTIMIZATION_CONFIGS[networkQuality], ...options }

    const results: T[] = []

    for (let i = 0; i < requests.length; i += config.batchSize) {
      const batch = requests.slice(i, i + config.batchSize)

      const batchPromises = batch.map(requestFn =>
        this.requestWithRetry(requestFn).catch(error => {
          console.warn('Batch request failed:', error)
          return null
        })
      )

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults.filter(result => result !== null) as T[])

      // 在批次之间添加延迟
      if (i + config.batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, config.batchDelay))
      }
    }

    return results
  }

  // 队列化请求
  queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.requestWithRetry(requestFn)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      const networkQuality = this.networkDetector.getNetworkQuality()
      const config = REQUEST_OPTIMIZATION_CONFIGS[networkQuality]

      // 根据网络质量决定并发数
      const concurrency = Math.min(config.batchSize, this.requestQueue.length)
      const batch = this.requestQueue.splice(0, concurrency)

      await Promise.all(batch.map(requestFn => requestFn()))

      // 批次间延迟
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, config.batchDelay))
      }
    }

    this.isProcessingQueue = false
  }

  // 获取待处理请求数量
  getPendingRequestCount(): number {
    return this.requestQueue.length + this.pendingRequests.size
  }

  // 清空请求队列
  clearQueue(): void {
    this.requestQueue = []
  }
}

// 全局实例
export const networkDetector = new NetworkDetector()
export const adaptiveImageQuality = new AdaptiveImageQuality(networkDetector)
export const requestOptimizer = new RequestOptimizer(networkDetector)

// 自动启动网络监控
if (typeof window !== 'undefined') {
  networkDetector.startMonitoring()

  // 页面卸载时停止监控
  window.addEventListener('beforeunload', () => {
    networkDetector.stopMonitoring()
  })

  // 监听网络变化并报告
  networkDetector.addNetworkChangeListener((info) => {
    console.log('🌐 Network changed:', info)

    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('network_change', 1, {
        effectiveType: info.effectiveType,
        downlink: info.downlink,
        rtt: info.rtt,
        saveData: info.saveData,
        isOnline: info.isOnline
      })
    }
  })
}

// 工具函数
export function getNetworkQualityDescription(quality: NetworkQuality): string {
  const descriptions = {
    excellent: '优秀 - 高速网络',
    good: '良好 - 快速网络',
    fair: '一般 - 中等网络',
    poor: '较差 - 慢速网络',
    offline: '离线 - 无网络连接'
  }
  return descriptions[quality]
}

export function shouldUseHighQualityImages(): boolean {
  const quality = networkDetector.getNetworkQuality()
  return quality === 'excellent' || quality === 'good'
}

export function shouldPreloadContent(): boolean {
  const info = networkDetector.getNetworkInfo()
  return info.isOnline && !info.saveData && (info.effectiveType === '4g' || info.effectiveType === '3g')
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}