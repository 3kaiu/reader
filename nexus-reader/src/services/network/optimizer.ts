/**
 * Network Optimizer - 网络优化工具
 * 提供请求重试、请求去重和网络条件检测
 */

import { logger } from '@/utils/logger'

// 网络连接信息接口
export interface NetworkInfo {
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g' | 'unknown'
  downlink: number // 下行带宽 (Mbps)
  rtt: number // 往返时间 (ms)
  saveData: boolean // 用户是否启用了数据节省模式
  isOnline: boolean // 是否在线
  connectionType: string // 连接类型
}

// 请求优化配置
export interface RequestOptimizationConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  jitterFactor: number
  timeout: number
}

// 网络质量等级
export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline'

// 默认请求优化配置
const REQUEST_OPTIMIZATION_CONFIGS: Record<NetworkQuality, RequestOptimizationConfig> = {
  excellent: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
    jitterFactor: 0.1,
    timeout: 10000,
  },
  good: {
    maxRetries: 3,
    baseDelay: 200,
    maxDelay: 3000,
    jitterFactor: 0.2,
    timeout: 15000,
  },
  fair: {
    maxRetries: 4,
    baseDelay: 500,
    maxDelay: 5000,
    jitterFactor: 0.3,
    timeout: 20000,
  },
  poor: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 8000,
    jitterFactor: 0.4,
    timeout: 30000,
  },
  offline: {
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    jitterFactor: 0,
    timeout: 5000,
  },
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
    // Event-driven monitoring - no polling needed
  }

  // 停止监控网络变化
  stopMonitoring(): void {
    if (this.updateInterval && typeof window !== 'undefined') {
      clearInterval(this.updateInterval)
      this.updateInterval = null
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
        connectionType: connection.type || 'unknown',
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
      connectionType: 'unknown',
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
      } catch (error: any) {
        console.error('Network change listener error:', error)
      }
    })
  }
}

/**
 * 请求优化器
 */
export class RequestOptimizer {
  private networkDetector: NetworkDetector
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
            totalAttempts: attempt + 1,
          })
        }

        return result
      } catch (error: any) {
        lastError = error as Error

        // 最后一次尝试失败
        if (attempt === config.maxRetries) {
          if (window.performanceMonitor) {
            window.performanceMonitor.reportMetric('request_retry_failed', config.maxRetries, {
              networkQuality,
              error: lastError.message,
            })
          }
          break
        }

        // If server tells us when to retry, respect it (bounded by maxDelay).
        // Support both Fetch API Headers and plain-object headers.
        const retryAfterHeader =
          (error as any)?.response?.headers?.get?.('retry-after') ??
          (error as any)?.response?.headers?.get?.('Retry-After') ??
          (error as any)?.response?.headers?.['retry-after'] ??
          (error as any)?.response?.headers?.['Retry-After']

        const retryAfterSeconds = retryAfterHeader
          ? Number.parseInt(String(retryAfterHeader), 10)
          : NaN
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          const delay = Math.min(retryAfterSeconds * 1000, config.maxDelay)
          console.log(
            `🔄 Server asked retry-after=${retryAfterSeconds}s, retrying in ${delay}ms...`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // 计算延迟时间（指数退避 + 抖动）
        const baseDelay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay)
        const jitter = baseDelay * config.jitterFactor * Math.random()
        const delay = baseDelay + jitter

        console.log(
          `🔄 Request failed (attempt ${attempt + 1}), retrying in ${delay.toFixed(0)}ms...`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('Request failed after all retries')
  }

  // 请求去重
  async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // 如果已有相同的请求在进行中，返回该请求的Promise
    if (this.pendingRequests.has(key)) {
      logger.debug(`Request deduplicated: ${key}`)
      return this.pendingRequests.get(key) as Promise<T>
    }

    // 创建新请求
    const requestPromise = this.requestWithRetry(requestFn).finally(() => {
      // 请求完成后从pending列表中移除
      this.pendingRequests.delete(key)
    })

    this.pendingRequests.set(key, requestPromise)
    return requestPromise
  }

  // 获取待处理请求数量
  getPendingRequestCount(): number {
    return this.pendingRequests.size
  }
}

// 全局实例
export const networkDetector = new NetworkDetector()
export const requestOptimizer = new RequestOptimizer(networkDetector)

// 自动启动网络监控
if (typeof window !== 'undefined') {
  networkDetector.startMonitoring()

  // 页面卸载时停止监控
  window.addEventListener('beforeunload', () => {
    networkDetector.stopMonitoring()
  })

  // 监听网络变化并报告
  networkDetector.addNetworkChangeListener(info => {
    logger.debug('Network changed:', info)

    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('network_change', 1, {
        effectiveType: info.effectiveType,
        downlink: info.downlink,
        rtt: info.rtt,
        saveData: info.saveData,
        isOnline: info.isOnline,
      })
    }
  })
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}
