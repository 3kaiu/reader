/**
 * 统一工具函数库
 *
 * 整合所有工具函数，消除重复代码：
 * - 缓存管理
 * - API客户端
 * - 错误处理
 * - 配置管理
 * - 性能监控
 * - 数据验证
 * - 存储操作
 * - 事件管理
 */

import { queueClientMetric } from '@/services/performance/client-reporter'

// ===== 缓存管理 =====

export class UnifiedCache {
  private static instance: UnifiedCache
  private memoryCache = new Map<string, CacheEntry>()
  private maxSize = 100

  private constructor() { }

  static getInstance(): UnifiedCache {
    if (!UnifiedCache.instance) {
      UnifiedCache.instance = new UnifiedCache()
    }
    return UnifiedCache.instance
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key)
    if (!entry) return null

    if (this.isExpired(entry)) {
      this.memoryCache.delete(key)
      return null
    }

    entry.accessCount++
    entry.lastAccessed = Date.now()
    return entry.data as T
  }

  set<T>(key: string, value: T, ttl?: number): void {
    if (this.memoryCache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed()
    }

    this.memoryCache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
    })
  }

  delete(key: string): boolean {
    return this.memoryCache.delete(key)
  }

  clear(): void {
    this.memoryCache.clear()
  }

  size(): number {
    return this.memoryCache.size
  }

  private isExpired(entry: CacheEntry): boolean {
    if (!entry.ttl) return false
    return Date.now() - entry.timestamp > entry.ttl
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, entry] of this.memoryCache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey)
    }
  }

  cleanup(): void {
    for (const [key, entry] of this.memoryCache) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key)
      }
    }
  }

  getStats(): { size: number; hitRate: number; totalHits: number; totalMisses: number } {
    let hits = 0
    let total = 0
    for (const entry of this.memoryCache.values()) {
      hits += entry.accessCount
      total += entry.accessCount + 1 // simplified miss calculation
    }
    return {
      size: this.memoryCache.size,
      hitRate: total > 0 ? hits / total : 0,
      totalHits: hits,
      totalMisses: total - hits
    }
  }
}

interface CacheEntry {
  data: any
  timestamp: number
  ttl?: number
  accessCount: number
  lastAccessed: number
}

// ===== API客户端 =====

export class UnifiedApiClient {
  private static instance: UnifiedApiClient
  private edgeBaseURL: string
  private directBaseURL: string
  private directApiKey: string
  private cache = UnifiedCache.getInstance()
  private retryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
  }

  private constructor() {
    this.edgeBaseURL = import.meta.env.VITE_API_BASE_URL || '/api'
    this.directBaseURL = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
    this.directApiKey = import.meta.env.VITE_NEXUS_LITE_API_KEY || ''
    this.directApiKey = import.meta.env.VITE_NEXUS_LITE_API_KEY || ''
  }

  static getInstance(): UnifiedApiClient {
    if (!UnifiedApiClient.instance) {
      UnifiedApiClient.instance = new UnifiedApiClient()
    }
    return UnifiedApiClient.instance
  }

  async get<T>(endpoint: string, config: ApiConfig = {}): Promise<ApiResponse<T>> {
    return this.request('GET', endpoint, undefined, config)
  }

  async post<T>(endpoint: string, data?: any, config: ApiConfig = {}): Promise<ApiResponse<T>> {
    return this.request('POST', endpoint, data, config)
  }

  async put<T>(endpoint: string, data?: any, config: ApiConfig = {}): Promise<ApiResponse<T>> {
    return this.request('PUT', endpoint, data, config)
  }

  async delete<T>(endpoint: string, config: ApiConfig = {}): Promise<ApiResponse<T>> {
    return this.request('DELETE', endpoint, undefined, config)
  }

  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    config: ApiConfig = {}
  ): Promise<ApiResponse<T>> {
    const baseURL = endpoint.startsWith('http') ? '' : this.pickBaseUrlForPath(endpoint)
    const url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`
    const cacheKey = (typeof config.cache === 'object' && config.cache.key) || `${method}:${url}:${JSON.stringify(data)}`

    // 检查缓存
    if (method === 'GET' && config.cache !== false) {
      const cached = this.cache.get<ApiResponse<T>>(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }
    }

    const startTime = Date.now()
    let lastError: Error | null = null
    const usedDirect = !endpoint.startsWith('http') && baseURL === this.directBaseURL && Boolean(this.directBaseURL)
    let directFallbackTried = false

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const route = usedDirect
          ? (directFallbackTried ? 'direct_fallback' : 'direct')
          : 'edge'
        const response = await fetch(
          (!endpoint.startsWith('http') && directFallbackTried)
            ? `${this.edgeBaseURL}${endpoint}`
            : url,
          {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(this.shouldAttachApiKey(endpoint) ? { 'X-API-Key': this.directApiKey } : {}),
            ...config.headers,
          },
          body: data ? JSON.stringify(data) : undefined,
          signal: config.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const responseData = await response.json()
        const result: ApiResponse<T> = {
          data: responseData,
          status: response.status,
          headers: Object.fromEntries((response.headers as any).entries()),
          cached: false,
          responseTime: Date.now() - startTime,
          requestId: crypto.randomUUID(),
        }

        performanceMonitor.recordMetric('api_route', 1, { route, method })
        performanceMonitor.recordMetric('api_response_ms', result.responseTime, { route, method })

        // 缓存GET请求
        if (method === 'GET' && config.cache !== false) {
          const ttl = typeof config.cache === 'object' ? config.cache.ttl : undefined
          this.cache.set(cacheKey, result, ttl)
        }

        return result
      } catch (error: any) {
        lastError = error as Error

        // One-shot fallback: if direct-connect likely failed due to network/CORS, try edge once.
        if (usedDirect && !directFallbackTried) {
          const msg = String((error as any)?.message || error || '')
          const isNetworkOrCors =
            (error as any)?.name === 'AbortError' ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError') ||
            (msg.toLowerCase().includes('fetch') && msg.toLowerCase().includes('failed'))
          if (isNetworkOrCors) {
            directFallbackTried = true
            performanceMonitor.recordMetric('api_direct_fallback', 1, { method })
            continue
          }
        }

        if (attempt < this.retryConfig.maxRetries) {
          const retryAfter = (error as any)?.response?.headers?.get?.('retry-after')
          const retryAfterSeconds = retryAfter ? Number.parseInt(String(retryAfter), 10) : NaN
          const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? Math.min(retryAfterSeconds * 1000, this.retryConfig.maxDelay)
            : Math.min(
              this.retryConfig.baseDelay * Math.pow(2, attempt),
              this.retryConfig.maxDelay
            )
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('Request failed after all retries')
  }

  private pickBaseUrlForPath(path: string): string {
    if (!this.directBaseURL) return this.edgeBaseURL

    const pathname = path.split('?')[0]
    const workerOnlyPrefixes = ['/api/analytics', '/api/preferences', '/api/content/upload', '/api/backup']
    if (workerOnlyPrefixes.some(p => pathname === p || pathname.startsWith(p))) return this.edgeBaseURL

    const directAllowlistPrefixes = [
      '/api/search',
      '/api/book',
      '/api/chapters',
      '/api/content',
      '/api/batch/content',
      '/api/sources',
      '/api/bookshelf',
      '/api/groups',
      '/api/replace_rules',
      '/api/discovery',
      '/api/ai/',
      '/api/voice/',
    ]
    const shouldUseDirect = directAllowlistPrefixes.some(p => pathname === p || pathname.startsWith(p))
    return shouldUseDirect ? this.directBaseURL : this.edgeBaseURL
  }

  private shouldAttachApiKey(path: string): boolean {
    if (!this.directBaseURL || !this.directApiKey) return false
    const base = this.pickBaseUrlForPath(path)
    return base === this.directBaseURL
  }
}

interface ApiConfig {
  headers?: Record<string, string>
  cache?: boolean | { key?: string; ttl?: number }
  signal?: AbortSignal
}

interface ApiResponse<T = any> {
  data: T
  status: number
  headers: Record<string, string>
  cached: boolean
  responseTime: number
  requestId: string
}

// ===== 配置管理 =====

export class UnifiedConfig {
  private static instance: UnifiedConfig
  private config = new Map<string, any>()
  private listeners = new Map<string, Set<(value: any) => void>>()

  private constructor() {
    this.loadDefaultConfig()
  }

  static getInstance(): UnifiedConfig {
    if (!UnifiedConfig.instance) {
      UnifiedConfig.instance = new UnifiedConfig()
    }
    return UnifiedConfig.instance
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.config.get(key) ?? defaultValue
  }

  set<T>(key: string, value: T): void {
    this.config.set(key, value)

    // 通知监听器
    const listeners = this.listeners.get(key)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(value)
        } catch (error: any) {
          console.error('Config listener error:', error)
        }
      })
    }

    // 持久化存储
    this.persistConfig()
  }

  watch<T>(key: string, callback: (value: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(callback as any)

    return () => {
      const listeners = this.listeners.get(key)
      if (listeners) {
        listeners.delete(callback as any)
      }
    }
  }

  private loadDefaultConfig(): void {
    // 默认配置
    this.config.set('api.baseURL', import.meta.env.VITE_API_BASE_URL || '/api')
    this.config.set('api.timeout', 10000)
    this.config.set('cache.enabled', true)
    this.config.set('cache.ttl', 5 * 60 * 1000) // 5分钟
    this.config.set('ui.theme', 'auto')
    this.config.set('ui.language', 'zh-CN')

    // 从localStorage加载用户配置
    this.loadPersistedConfig()
  }

  private loadPersistedConfig(): void {
    try {
      const persisted = localStorage.getItem('app-config')
      if (persisted) {
        const parsed = JSON.parse(persisted)
        Object.entries(parsed).forEach(([key, value]) => {
          this.config.set(key, value)
        })
      }
    } catch (error: any) {
      console.warn('Failed to load persisted config:', error)
    }
  }

  private persistConfig(): void {
    try {
      const toPersist: Record<string, any> = {}
      this.config.forEach((value, key) => {
        // 只持久化用户配置
        if (key.startsWith('user.') || key.startsWith('ui.') || key.startsWith('preferences.')) {
          toPersist[key] = value
        }
      })
      localStorage.setItem('app-config', JSON.stringify(toPersist))
    } catch (error: any) {
      console.warn('Failed to persist config:', error)
    }
  }
}

// ===== 错误处理 =====

export class UnifiedErrorHandler {
  private static instance: UnifiedErrorHandler
  private errorQueue: ErrorEvent[] = []
  private maxQueueSize = 100

  private constructor() { }

  static getInstance(): UnifiedErrorHandler {
    if (!UnifiedErrorHandler.instance) {
      UnifiedErrorHandler.instance = new UnifiedErrorHandler()
    }
    return UnifiedErrorHandler.instance
  }

  handle(error: Error | string, context?: ErrorContext): void {
    const errorEvent: ErrorEvent = {
      id: crypto.randomUUID(),
      error: typeof error === 'string' ? new Error(error) : error,
      context: context || {},
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    this.errorQueue.push(errorEvent)

    // 限制队列大小
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift()
    }

    // 控制台输出
    console.error('Unified Error Handler:', errorEvent)

    // 发送到监控系统
    this.reportToMonitoring(errorEvent)
  }

  getErrors(limit = 10): ErrorEvent[] {
    return this.errorQueue.slice(-limit)
  }

  clearErrors(): void {
    this.errorQueue = []
  }

  private async reportToMonitoring(errorEvent: ErrorEvent): Promise<void> {
    // 这里可以发送到外部监控服务
    try {
      // 模拟发送到监控服务
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorEvent),
      })
    } catch (error: any) {
      // 如果监控服务本身出错，只记录到控制台
      console.warn('Failed to report error to monitoring:', error)
    }
  }
}

interface ErrorEvent {
  id: string
  error: Error
  context: ErrorContext
  timestamp: number
  userAgent: string
  url: string
}

interface ErrorContext {
  component?: string
  operation?: string
  userId?: string
  [key: string]: any
}

// ===== 性能监控 =====

export class UnifiedPerformanceMonitor {
  private static instance: UnifiedPerformanceMonitor
  private metrics: PerformanceMetric[] = []
  private observers = new Set<(metric: PerformanceMetric) => void>()

  private constructor() {
    this.startMonitoring()
  }

  static getInstance(): UnifiedPerformanceMonitor {
    if (!UnifiedPerformanceMonitor.instance) {
      UnifiedPerformanceMonitor.instance = new UnifiedPerformanceMonitor()
    }
    return UnifiedPerformanceMonitor.instance
  }

  recordMetric(name: string, value: number, tags: Record<string, string | number> = {}): void {
    const metric: PerformanceMetric = {
      id: crypto.randomUUID(),
      name,
      value,
      tags: {}, // Initialize tags as an empty object of type Record<string, string>
      timestamp: Date.now(),
    }

    // Convert all tag values to string for the PerformanceMetric interface
    Object.entries(tags).forEach(([k, v]) => {
      metric.tags[k] = String(v)
    })

    this.metrics.push(metric)

    // Best-effort: send a subset of metrics to Worker in batches.
    try {
      const safeTags: Record<string, string> = {}
      Object.entries(tags).forEach(([k, v]) => {
        safeTags[k] = String(v)
      })
      queueClientMetric({ name, value, unit: 'ms', tags: safeTags, timestamp: metric.timestamp })
    } catch {
      // ignore
    }

    // 限制指标数量
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }

    // 通知观察者
    this.observers.forEach(observer => {
      try {
        observer(metric)
      } catch (error: any) {
        console.error('Performance observer error:', error)
      }
    })
  }

  getMetrics(name?: string, limit = 100): PerformanceMetric[] {
    let filtered = this.metrics
    if (name) {
      filtered = filtered.filter(m => m.name === name)
    }
    return filtered.slice(-limit)
  }

  observe(observer: (metric: PerformanceMetric) => void): () => void {
    this.observers.add(observer)
    return () => {
      this.observers.delete(observer)
    }
  }

  getStats(): PerformanceStats {
    if (this.metrics.length === 0) {
      return {
        totalMetrics: 0,
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
        metricsByName: {},
      }
    }

    const values = this.metrics.map(m => m.value)
    const metricsByName: Record<string, number> = {}

    this.metrics.forEach(metric => {
      metricsByName[metric.name] = (metricsByName[metric.name] || 0) + 1
    })

    return {
      totalMetrics: this.metrics.length,
      averageValue: values.reduce((a, b) => a + b, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      metricsByName,
    }
  }

  private startMonitoring(): void {
    // 监控页面性能
    if (typeof window !== 'undefined' && 'performance' in window) {
      // LCP (Largest Contentful Paint)
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          this.recordMetric('lcp', entry.startTime, { type: 'lcp' })
        })
      }).observe({ entryTypes: ['largest-contentful-paint'] })

      // FID (First Input Delay)
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry: any) => {
          if (entry.processingStart) {
            this.recordMetric('fid', entry.processingStart - entry.startTime, { type: 'fid' })
          }
        })
      }).observe({ entryTypes: ['first-input'] })

      // CLS (Cumulative Layout Shift)
      new PerformanceObserver((list) => {
        let clsValue = 0
        const entries = list.getEntries()
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput && entry.value !== undefined) {
            clsValue += entry.value
          }
        })
        if (clsValue > 0) {
          this.recordMetric('cls', clsValue, { type: 'cls' })
        }
      }).observe({ entryTypes: ['layout-shift'] })
    }
  }
}

interface PerformanceMetric {
  id: string
  name: string
  value: number
  tags: Record<string, string> // Changed from Record<string, string | number>
  timestamp: number
}

interface PerformanceStats {
  totalMetrics: number
  averageValue: number
  minValue: number
  maxValue: number
  metricsByName: Record<string, number>
}

// ===== 数据验证 =====

export class UnifiedValidator {
  private static instance: UnifiedValidator
  private rules = new Map<string, ValidationRule>()

  private constructor() {
    this.registerBuiltInRules()
  }

  static getInstance(): UnifiedValidator {
    if (!UnifiedValidator.instance) {
      UnifiedValidator.instance = new UnifiedValidator()
    }
    return UnifiedValidator.instance
  }

  registerRule(name: string, rule: ValidationRule): void {
    this.rules.set(name, rule)
  }

  async validate(data: any, rules: ValidationConfig[]): Promise<ValidationResult> {
    const errors: ValidationError[] = []

    for (const rule of rules) {
      const validator = this.rules.get(rule.type)
      if (validator) {
        try {
          const isValid = await validator.validate(data, rule.params)
          if (!isValid) {
            errors.push({
              field: rule.field,
              rule: rule.type,
              message: rule.message || `${rule.field} validation failed`,
              params: rule.params,
            })
          }
        } catch (error: any) {
          errors.push({
            field: rule.field,
            rule: rule.type,
            message: error?.message || 'Validation error',
            params: rule.params,
          })
        }
      } else {
        errors.push({
          field: rule.field,
          rule: rule.type,
          message: `Unknown validation rule: ${rule.type}`,
          params: rule.params,
        })
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  private registerBuiltInRules(): void {
    // 必填验证
    this.registerRule('required', {
      validate: async (value, params) => {
        if (params?.allowEmpty === true) {
          return value !== undefined && value !== null
        }
        return value !== undefined && value !== null && value !== ''
      },
    })

    // 字符串长度验证
    this.registerRule('stringLength', {
      validate: async (value, params) => {
        if (typeof value !== 'string') return false
        const min = params?.min || 0
        const max = params?.max || Infinity
        return value.length >= min && value.length <= max
      },
    })

    // 数字范围验证
    this.registerRule('numberRange', {
      validate: async (value, params) => {
        if (typeof value !== 'number') return false
        const min = params?.min ?? -Infinity
        const max = params?.max ?? Infinity
        return value >= min && value <= max
      },
    })

    // 正则表达式验证
    this.registerRule('regex', {
      validate: async (value, params) => {
        if (typeof value !== 'string') return false
        const pattern = params?.pattern
        if (!pattern) return true
        const regex = new RegExp(pattern)
        return regex.test(value)
      },
    })

    // 枚举值验证
    this.registerRule('enum', {
      validate: async (value, params) => {
        const allowedValues = params?.values || []
        return allowedValues.includes(value)
      },
    })
  }
}

interface ValidationRule {
  validate: (value: any, params?: Record<string, any>) => Promise<boolean>
}

interface ValidationConfig {
  field: string
  type: string
  params?: Record<string, any>
  message?: string
}

interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  field: string
  rule: string
  message: string
  params?: Record<string, any>
}

// ===== 事件管理 =====

export class UnifiedEventManager {
  private static instance: UnifiedEventManager
  private listeners = new Map<string, Set<EventListener>>()

  private constructor() { }

  static getInstance(): UnifiedEventManager {
    if (!UnifiedEventManager.instance) {
      UnifiedEventManager.instance = new UnifiedEventManager()
    }
    return UnifiedEventManager.instance
  }

  on(event: string, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)

    return () => {
      const listeners = this.listeners.get(event)
      if (listeners) {
        listeners.delete(listener)
      }
    }
  }

  off(event: string, listener: EventListener): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data)
        } catch (error: any) {
          console.error('Event listener error:', error)
        }
      })
    }
  }

  once(event: string, listener: EventListener): () => void {
    const onceListener = (data: any) => {
      listener(data)
      this.off(event, onceListener)
    }
    return this.on(event, onceListener)
  }

  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

type EventListener = (data?: any) => void

// ===== 存储操作 =====

export class UnifiedStorage {
  private static instance: UnifiedStorage

  private constructor() { }

  static getInstance(): UnifiedStorage {
    if (!UnifiedStorage.instance) {
      UnifiedStorage.instance = new UnifiedStorage()
    }
    return UnifiedStorage.instance
  }

  get<T>(key: string, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : (defaultValue ?? null)
    } catch (error: any) {
      console.error('Storage get error:', error)
      return defaultValue ?? null
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error: any) {
      console.error('Storage set error:', error)
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error: any) {
      console.error('Storage remove error:', error)
    }
  }

  clear(): void {
    try {
      localStorage.clear()
    } catch (error: any) {
      console.error('Storage clear error:', error)
    }
  }

  keys(): string[] {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) keys.push(key)
      }
      return keys
    } catch (error: any) {
      console.error('Storage keys error:', error)
      return []
    }
  }
}

// ===== 优化器管理器 =====

export interface OptimizerConfig {
  enableMemoryOptimization: boolean
  enableCpuOptimization: boolean
  enableIoOptimization: boolean
  enableNetworkOptimization: boolean
  enableCacheOptimization: boolean
  enableAlgorithmOptimization: boolean
  monitoringIntervalMs: number
  optimizationIntervalMs: number
  maxConcurrentOptimizations: number
}

class OptimizerManager {
  private static instance: OptimizerManager
  private config: OptimizerConfig

  private constructor(config: OptimizerConfig) {
    this.config = config
    this.startOptimizationLoop()
  }

  static getInstance(config?: OptimizerConfig): OptimizerManager {
    if (!OptimizerManager.instance && config) {
      OptimizerManager.instance = new OptimizerManager(config)
    }
    return OptimizerManager.instance
  }

  private startOptimizationLoop(): void {
    // 定期运行优化
    setInterval(() => {
      this.runOptimizations()
    }, this.config.optimizationIntervalMs)

    // 定期监控
    setInterval(() => {
      this.runMonitoring()
    }, this.config.monitoringIntervalMs)
  }

  private runOptimizations(): void {
    // 运行各种优化
    if (this.config.enableMemoryOptimization) {
      this.optimizeMemory()
    }
    if (this.config.enableCacheOptimization) {
      this.optimizeCache()
    }
    // 其他优化...
  }

  private runMonitoring(): void {
    // 收集性能指标
    performanceMonitor.recordMetric('memory_usage', (performance as any).memory?.usedJSHeapSize || 0)
    performanceMonitor.recordMetric('cache_size', cache.size())
    // 其他监控...
  }

  private optimizeMemory(): void {
    // 强制垃圾回收（如果可用）
    if (window.gc) {
      window.gc()
    }

    // 清理过期缓存
    cache.cleanup()
  }

  private optimizeCache(): void {
    // 缓存优化逻辑
    const stats = cache.getStats ? cache.getStats() : null
    if (stats && stats.size > 80) { // 如果缓存使用率超过80%
      // 可以实现LRU淘汰或其他优化策略
    }
  }
}

let optimizerManager: OptimizerManager | null = null

export function initOptimizerManager(config: OptimizerConfig): void {
  optimizerManager = OptimizerManager.getInstance(config)
}

export function getOptimizerManager(): OptimizerManager | null {
  return optimizerManager
}

// ===== 便捷实例导出 =====

export const cache = UnifiedCache.getInstance()

// Export logger from the separate logger utility
export { logger } from './logger'
export const config = UnifiedConfig.getInstance()
export const errorHandler = UnifiedErrorHandler.getInstance()
// [Refactor] performanceMonitor import removed as it was unused.
export const performanceMonitor = UnifiedPerformanceMonitor.getInstance()
export const validator = UnifiedValidator.getInstance()
export const eventManager = UnifiedEventManager.getInstance()
export const storage = UnifiedStorage.getInstance()

// ===== 默认导出 =====

export default {
  cache,
  config,
  errorHandler,
  performanceMonitor,
  validator,
  eventManager,
  storage,
  initOptimizerManager,
  getOptimizerManager,
}