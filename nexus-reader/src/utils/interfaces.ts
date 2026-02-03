/**
 * Standardized Interfaces for Nexus Reader Components
 * Provides loose coupling and high cohesion through standardized contracts
 */

// ===== Core Interfaces =====

export interface BookSourceEngine {
  readonly name: string
  readonly version: string

  supportsUrl(url: string): boolean

  searchBooks(query: string, page?: number): Promise<BookItem[]>
  getBookDetails(url: string): Promise<BookItem>
  getTableOfContents(url: string): Promise<TocItem[]>
  getChapterContent(url: string): Promise<Chapter>

  testConnectivity(): Promise<boolean>
  getHealthStatus(): EngineHealthStatus
  getStatistics(): EngineStatistics
}

export interface Fetcher {
  get(url: string, headers?: Record<string, string>): Promise<FetchResponse>
  post(url: string, body: string, headers?: Record<string, string>): Promise<FetchResponse>
  getStatistics(): FetcherStatistics
}

export interface Cache<K = string, V = any> {
  get(key: K): Promise<V | null>
  set(key: K, value: V, ttlSeconds?: number): Promise<void>
  delete(key: K): Promise<boolean>
  clear(): Promise<void>
  getStatistics(): CacheStatistics
}

export interface Storage {
  store(key: string, data: Uint8Array): Promise<void>
  retrieve(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<boolean>
  listKeys(prefix?: string): Promise<string[]>
  getStatistics(): StorageStatistics
}

export interface ConfigProvider {
  get<T>(key: string, defaultValue?: T): T
  set<T>(key: string, value: T): void
  watch<T>(key: string, callback: (value: T) => void): () => void
  getAll(): Record<string, any>
  validate(): ValidationResult
}

export interface HealthMonitor {
  recordSuccess(operation: string, duration: number, metadata?: Record<string, any>): void
  recordFailure(operation: string, error: Error, metadata?: Record<string, any>): void
  getHealthStatus(): HealthStatus
  getStatistics(): HealthStatistics
}

export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void
  setGauge(name: string, value: number, labels?: Record<string, string>): void
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void
  getMetrics(): Record<string, MetricValue>
}

// ===== Data Structures =====

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface EngineHealthStatus {
  status: HealthState
  lastCheck: Date
  responseTime?: number
  errorCount: number
  successCount: number
}

export interface EngineStatistics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  uptime: number
  memoryUsage?: number
}

export interface FetcherStatistics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalBytesDownloaded: number
  averageResponseTime: number
  activeConnections: number
}

export interface CacheStatistics {
  totalEntries: number
  hitCount: number
  missCount: number
  evictionCount: number
  hitRate: number
  totalSizeBytes: number
}

export interface StorageStatistics {
  totalFiles: number
  totalSizeBytes: number
  readOperations: number
  writeOperations: number
  deleteOperations: number
  averageReadTime: number
  averageWriteTime: number
}

export interface HealthStatus {
  overallState: HealthState
  components: Record<string, ComponentHealth>
  lastCheck: Date
}

export interface ComponentHealth {
  state: HealthState
  responseTime?: number
  errorMessage?: string
  lastSuccess?: Date
  lastFailure?: Date
}

export interface HealthStatistics {
  totalChecks: number
  successfulChecks: number
  failedChecks: number
  averageResponseTime: number
  uptimePercentage: number
}

export interface ConfigChangeEvent<T = any> {
  key: string
  oldValue?: T
  newValue: T
  source: string
  timestamp: Date
}

export type MetricValue =
  | { type: 'counter'; value: number }
  | { type: 'gauge'; value: number }
  | { type: 'histogram'; value: number[] }

// ===== Enumerations =====

export enum HealthState {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

// ===== Domain Types =====

export interface BookItem {
  id: string
  title: string
  author: string
  description?: string
  cover?: string
  url: string
  source: string
  tags?: string[]
  status?: string
  wordCount?: number
  updateTime?: Date
}

export interface TocItem {
  id: string
  title: string
  url: string
  index: number
  isVip?: boolean
  updateTime?: Date
}

export interface Chapter {
  id: string
  title: string
  content: string
  url: string
  index: number
  wordCount?: number
  updateTime?: Date
}

export interface FetchResponse {
  status: number
  headers: Record<string, string>
  body: string
  url: string
}

// ===== Factory Interfaces =====

export interface EngineFactory {
  createEngine(engineType: string, config?: any): BookSourceEngine
  getAvailableEngines(): string[]
}

export interface CacheFactory {
  createCache(cacheType: string, config?: any): Cache
  getAvailableCaches(): string[]
}

export interface ServiceFactory {
  createService<T>(serviceType: string, config?: any): T
  getAvailableServices(): string[]
}

// ===== Abstract Base Classes =====

export abstract class BaseBookSourceEngine implements BookSourceEngine {
  protected _stats: EngineStatistics
  protected _startTime: Date

  constructor(public readonly name: string, public readonly version: string = '1.0.0') {
    this._startTime = new Date()
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      uptime: 0,
      memoryUsage: undefined
    }
  }

  abstract supportsUrl(url: string): boolean
  abstract searchBooks(query: string, page?: number): Promise<BookItem[]>
  abstract getBookDetails(url: string): Promise<BookItem>
  abstract getTableOfContents(url: string): Promise<TocItem[]>
  abstract getChapterContent(url: string): Promise<Chapter>

  async testConnectivity(): Promise<boolean> {
    try {
      // Default implementation - can be overridden
      return true
    } catch {
      return false
    }
  }

  getHealthStatus(): EngineHealthStatus {
    const successRate = this._stats.totalRequests > 0
      ? this._stats.successfulRequests / this._stats.totalRequests
      : 0

    let status = HealthState.HEALTHY
    if (successRate < 0.5) status = HealthState.UNHEALTHY
    else if (successRate < 0.8) status = HealthState.DEGRADED

    return {
      status,
      lastCheck: new Date(),
      responseTime: this._stats.averageResponseTime,
      errorCount: this._stats.failedRequests,
      successCount: this._stats.successfulRequests
    }
  }

  getStatistics(): EngineStatistics {
    this._stats.uptime = Date.now() - this._startTime.getTime()
    return { ...this._stats }
  }

  protected recordRequest(success: boolean, duration: number): void {
    this._stats.totalRequests++
    if (success) {
      this._stats.successfulRequests++
    } else {
      this._stats.failedRequests++
    }

    // Update rolling average response time
    const alpha = 0.1
    this._stats.averageResponseTime =
      this._stats.averageResponseTime * (1 - alpha) + duration * alpha
  }

  async shutdown(): Promise<void> {
    // Optional cleanup
  }
}

export abstract class BaseCache<K = string, V = any> implements Cache<K, V> {
  protected _stats: CacheStatistics

  constructor() {
    this._stats = {
      totalEntries: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      hitRate: 0,
      totalSizeBytes: 0
    }
  }

  abstract get(key: K): Promise<V | null>
  abstract set(key: K, value: V, ttlSeconds?: number): Promise<void>
  abstract delete(key: K): Promise<boolean>
  abstract clear(): Promise<void>

  getStatistics(): CacheStatistics {
    const total = this._stats.hitCount + this._stats.missCount
    this._stats.hitRate = total > 0 ? this._stats.hitCount / total : 0
    return { ...this._stats }
  }

  protected recordHit(): void {
    this._stats.hitCount++
  }

  protected recordMiss(): void {
    this._stats.missCount++
  }

  protected recordEviction(): void {
    this._stats.evictionCount++
  }
}

// ===== Utility Functions =====

export function createServiceFactory<T>(): ServiceFactory {
  const services = new Map<string, () => T>()

  return {
    createService(serviceType: string, config?: any): T {
      const factory = services.get(serviceType)
      if (!factory) {
        throw new Error(`Unknown service type: ${serviceType}`)
      }
      return factory()
    },

    getAvailableServices(): string[] {
      return Array.from(services.keys())
    },

    registerService: (serviceType: string, factory: () => T) => {
      services.set(serviceType, factory)
    }
  } as ServiceFactory & { registerService: (type: string, factory: () => T) => void }
}