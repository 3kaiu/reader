/**
 * 统一API客户端
 *
 * 整合所有API调用功能，提供统一的接口：
 * - HTTP请求处理
 * - 缓存管理
 * - 错误处理
 * - 重试机制
 * - 离线支持
 * - 性能监控
 */

import { ofetch, type FetchOptions } from 'ofetch'
import { decode, encode } from '@msgpack/msgpack'
import { NexusError, ErrorCode, reportError } from '@/utils/errors'
import { getDomainLayer } from '@/domain'

// ===== 配置常量 =====

const API_CONFIG = {
  // 基础配置
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  TIMEOUT: 10000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,

  // 缓存配置
  CACHE_ENABLED: true,
  CACHE_TTL: 5 * 60 * 1000, // 5分钟
  MAX_CACHE_SIZE: 100,

  // 压缩配置
  COMPRESSION_ENABLED: true,
  COMPRESSION_THRESHOLD: 1024, // 1KB以上启用压缩

  // 离线配置
  OFFLINE_ENABLED: true,
  OFFLINE_CACHE_TTL: 24 * 60 * 60 * 1000, // 24小时
}

// ===== 类型定义 =====

export interface ApiRequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: any
  params?: Record<string, any>
  headers?: Record<string, string>
  timeout?: number
  retries?: number
  cache?: boolean | CacheConfig
  compress?: boolean
  priority?: 'low' | 'normal' | 'high'
  signal?: AbortSignal
}

export interface CacheConfig {
  enabled: boolean
  ttl?: number
  key?: string
}

export interface ApiResponse<T = any> {
  data: T
  status: number
  headers: Record<string, string>
  cached: boolean
  fromOffline: boolean
  responseTime: number
  requestId: string
}

export interface RequestMetrics {
  url: string
  method: string
  status: number
  responseTime: number
  size: number
  cached: boolean
  timestamp: number
}

export interface CircuitBreakerState {
  failures: number
  lastFailure: number
  state: 'closed' | 'open' | 'half-open'
}

// ===== 缓存管理器 =====

class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private accessOrder = new Set<string>()

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      this.accessOrder.delete(key)
      return null
    }

    // 更新访问顺序
    this.accessOrder.delete(key)
    this.accessOrder.add(key)

    return entry.data
  }

  set<T>(key: string, data: T, ttl = API_CONFIG.CACHE_TTL): void {
    // 检查缓存大小限制
    if (this.cache.size >= API_CONFIG.MAX_CACHE_SIZE) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })

    this.accessOrder.add(key)
  }

  delete(key: string): void {
    this.cache.delete(key)
    this.accessOrder.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder.clear()
  }

  size(): number {
    return this.cache.size
  }

  private evictOldest(): void {
    const oldestKey = this.accessOrder.values().next().value
    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.accessOrder.delete(oldestKey)
    }
  }

  // 清理过期缓存
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        this.accessOrder.delete(key)
      }
    }
  }
}

// ===== 断路器 =====

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  }

  private readonly failureThreshold = 5
  private readonly recoveryTimeout = 60000 // 1分钟
  private readonly monitoringPeriod = 10000 // 10秒

  shouldAllow(): boolean {
    switch (this.state.state) {
      case 'closed':
        return true
      case 'open':
        if (Date.now() - this.state.lastFailure > this.recoveryTimeout) {
          this.state.state = 'half-open'
          return true
        }
        return false
      case 'half-open':
        return true
      default:
        return false
    }
  }

  recordSuccess(): void {
    this.state.failures = 0
    this.state.state = 'closed'
  }

  recordFailure(): void {
    this.state.failures++
    this.state.lastFailure = Date.now()

    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'open'
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state }
  }
}

// ===== 请求队列管理器 =====

class RequestQueueManager {
  private queues = new Map<string, Array<() => Promise<any>>>()
  private processing = new Set<string>()

  async enqueue<T>(
    key: string,
    requestFn: () => Promise<T>,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.queues.has(key)) {
        this.queues.set(key, [])
      }

      const queue = this.queues.get(key)!

      const wrappedRequest = async () => {
        try {
          const result = await requestFn()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.processing.delete(key)
          this.processNext(key)
        }
      }

      // 根据优先级插入队列
      switch (priority) {
        case 'high':
          queue.unshift(wrappedRequest)
          break
        case 'low':
          queue.push(wrappedRequest)
          break
        default:
          queue.splice(Math.floor(queue.length / 2), 0, wrappedRequest)
      }

      this.processNext(key)
    })
  }

  private processNext(key: string): void {
    const queue = this.queues.get(key)
    if (!queue || queue.length === 0 || this.processing.has(key)) {
      return
    }

    this.processing.add(key)
    const nextRequest = queue.shift()
    if (nextRequest) {
      nextRequest()
    }
  }
}

// ===== 统一API客户端 =====

export class UnifiedApiClient {
  private cacheManager = new CacheManager()
  private circuitBreaker = new CircuitBreaker()
  private queueManager = new RequestQueueManager()
  private metrics: RequestMetrics[] = []
  private cleanupInterval: number | null = null

  constructor() {
    this.startCleanupTask()
  }

  /**
   * 发送API请求
   */
  async request<T = any>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
    const requestId = crypto.randomUUID()
    const startTime = Date.now()

    try {
      // 检查断路器
      if (!this.circuitBreaker.shouldAllow()) {
        throw new NexusError(
          ErrorCode.NETWORK_ERROR,
          'Service temporarily unavailable (circuit breaker open)',
          { requestId }
        )
      }

      // 生成缓存键
      const cacheKey = this.generateCacheKey(config)
      const shouldCache = this.shouldCache(config)

      // 检查缓存
      if (shouldCache && config.method === 'GET') {
        const cached = this.cacheManager.get(cacheKey)
        if (cached) {
          this.recordMetrics({
            url: config.url,
            method: config.method || 'GET',
            status: 200,
            responseTime: Date.now() - startTime,
            size: JSON.stringify(cached.data).length,
            cached: true,
            timestamp: Date.now(),
          })

          return {
            data: cached.data,
            status: 200,
            headers: {},
            cached: true,
            fromOffline: false,
            responseTime: Date.now() - startTime,
            requestId,
          }
        }
      }

      // 排队处理请求
      const result = await this.queueManager.enqueue(
        cacheKey,
        () => this.executeRequest(config, requestId),
        config.priority || 'normal'
      )

      const responseTime = Date.now() - startTime

      // 缓存响应
      if (shouldCache && config.method === 'GET' && result.status === 200) {
        const ttl = this.getCacheTTL(config)
        this.cacheManager.set(cacheKey, result.data, ttl)
      }

      // 记录成功指标
      this.circuitBreaker.recordSuccess()
      this.recordMetrics({
        url: config.url,
        method: config.method || 'GET',
        status: result.status,
        responseTime,
        size: JSON.stringify(result.data).length,
        cached: false,
        timestamp: Date.now(),
      })

      return {
        ...result,
        cached: false,
        fromOffline: false,
        responseTime,
        requestId,
      }

    } catch (error) {
      const responseTime = Date.now() - startTime

      // 记录失败指标
      this.circuitBreaker.recordFailure()
      this.recordMetrics({
        url: config.url,
        method: config.method || 'GET',
        status: error.status || 0,
        responseTime,
        size: 0,
        cached: false,
        timestamp: Date.now(),
      })

      // 转换为NexusError
      const nexusError = error instanceof NexusError ? error :
        new NexusError(
          ErrorCode.NETWORK_ERROR,
          error.message || 'Request failed',
          { requestId, originalError: error }
        )

      reportError(nexusError, {
        url: config.url,
        method: config.method,
        requestId,
      })

      throw nexusError
    }
  }

  /**
   * GET请求
   */
  async get<T = any>(url: string, config: Partial<ApiRequestConfig> = {}): Promise<ApiResponse<T>> {
    return this.request({
      ...config,
      url,
      method: 'GET',
    })
  }

  /**
   * POST请求
   */
  async post<T = any>(url: string, data?: any, config: Partial<ApiRequestConfig> = {}): Promise<ApiResponse<T>> {
    return this.request({
      ...config,
      url,
      method: 'POST',
      data,
    })
  }

  /**
   * PUT请求
   */
  async put<T = any>(url: string, data?: any, config: Partial<ApiRequestConfig> = {}): Promise<ApiResponse<T>> {
    return this.request({
      ...config,
      url,
      method: 'PUT',
      data,
    })
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(url: string, config: Partial<ApiRequestConfig> = {}): Promise<ApiResponse<T>> {
    return this.request({
      ...config,
      url,
      method: 'DELETE',
    })
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cacheManager.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      size: this.cacheManager.size(),
      maxSize: API_CONFIG.MAX_CACHE_SIZE,
    }
  }

  /**
   * 获取请求指标
   */
  getMetrics(limit = 100): RequestMetrics[] {
    return this.metrics.slice(-limit)
  }

  /**
   * 获取断路器状态
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState()
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health', {
        timeout: 5000,
        retries: 0,
      })
      return true
    } catch {
      return false
    }
  }

  private async executeRequest(config: ApiRequestConfig, requestId: string): Promise<ApiResponse> {
    const url = config.url.startsWith('http') ? config.url : `${API_CONFIG.BASE_URL}${config.url}`

    const fetchOptions: FetchOptions = {
      method: config.method || 'GET',
      timeout: config.timeout || API_CONFIG.TIMEOUT,
      retry: config.retries || API_CONFIG.MAX_RETRIES,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...config.headers,
      },
    }

    // 添加请求体
    if (config.data) {
      if (API_CONFIG.COMPRESSION_ENABLED && JSON.stringify(config.data).length > API_CONFIG.COMPRESSION_THRESHOLD) {
        // 使用MessagePack压缩
        fetchOptions.body = encode(config.data)
        fetchOptions.headers!['Content-Type'] = 'application/x-msgpack'
      } else {
        fetchOptions.body = JSON.stringify(config.data)
      }
    }

    // 添加查询参数
    if (config.params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(config.params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      }
      const separator = url.includes('?') ? '&' : '?'
      fetchOptions.query = searchParams.toString()
    }

    // 执行请求
    const response = await ofetch(url, fetchOptions)

    // 处理响应
    let data = response
    const headers: Record<string, string> = {}

    // 复制响应头
    if (typeof Headers !== 'undefined' && response instanceof Response) {
      for (const [key, value] of response.headers.entries()) {
        headers[key] = value
      }
    }

    // 解压响应体
    if (headers['content-type'] === 'application/x-msgpack') {
      data = decode(new Uint8Array(await response.arrayBuffer()))
    }

    return {
      data,
      status: 200, // ofetch已经处理了HTTP状态码
      headers,
      cached: false,
      fromOffline: false,
      responseTime: 0, // 会在外部计算
      requestId,
    }
  }

  private generateCacheKey(config: ApiRequestConfig): string {
    const cacheConfig = typeof config.cache === 'object' ? config.cache : null
    if (cacheConfig?.key) {
      return cacheConfig.key
    }

    const params = config.params ? JSON.stringify(config.params) : ''
    return `${config.method || 'GET'}:${config.url}:${params}`
  }

  private shouldCache(config: ApiRequestConfig): boolean {
    if (!API_CONFIG.CACHE_ENABLED) return false

    const cacheConfig = config.cache
    if (cacheConfig === false) return false
    if (typeof cacheConfig === 'object' && cacheConfig.enabled === false) return false

    return true
  }

  private getCacheTTL(config: ApiRequestConfig): number {
    const cacheConfig = typeof config.cache === 'object' ? config.cache : null
    return cacheConfig?.ttl || API_CONFIG.CACHE_TTL
  }

  private recordMetrics(metrics: RequestMetrics): void {
    this.metrics.push(metrics)

    // 保留最近1000个指标
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }

    // 发送到领域层的性能监控
    const domainLayer = getDomainLayer()
    // 这里可以集成到领域层的性能监控
  }

  private startCleanupTask(): void {
    this.cleanupInterval = window.setInterval(() => {
      this.cacheManager.cleanup()
    }, 60000) // 每分钟清理一次
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// ===== 单例实例 =====

let apiClientInstance: UnifiedApiClient | null = null

export function getApiClient(): UnifiedApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new UnifiedApiClient()
  }
  return apiClientInstance
}

export function destroyApiClient(): void {
  if (apiClientInstance) {
    apiClientInstance.destroy()
    apiClientInstance = null
  }
}

// ===== 便捷方法 =====

export const api = {
  get: <T = any>(url: string, config?: Partial<ApiRequestConfig>) =>
    getApiClient().get<T>(url, config),

  post: <T = any>(url: string, data?: any, config?: Partial<ApiRequestConfig>) =>
    getApiClient().post<T>(url, data, config),

  put: <T = any>(url: string, data?: any, config?: Partial<ApiRequestConfig>) =>
    getApiClient().put<T>(url, data, config),

  delete: <T = any>(url: string, config?: Partial<ApiRequestConfig>) =>
    getApiClient().delete<T>(url, config),

  request: <T = any>(config: ApiRequestConfig) =>
    getApiClient().request<T>(config),
}

// ===== 默认导出 =====

export default getApiClient()