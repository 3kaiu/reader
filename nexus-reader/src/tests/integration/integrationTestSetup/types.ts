export interface TestUserRecord {
  id: string
  preferences: Record<string, unknown>
  progress: Record<string, unknown>
}

export interface TestNovelRecord {
  id: string
  title: string
  author: string
  chapters: Array<{
    id: string
    title: string
    content: string
  }>
}

export interface LoadTestAccumulator {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  responseTimes: number[]
}

export interface LoadTestOptions {
  endpoint: string
  concurrency: number
  duration: number
  requestsPerSecond?: number
}

export interface LoadTestSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  maxResponseTime: number
  minResponseTime: number
  requestsPerSecond: number
}

export interface PerformanceMonitorStats {
  duration: number
  requests: Record<string, number>
  averageResponseTimes: Record<string, number>
  memoryUsage: Record<string, number>
}

export interface TestPerformanceMonitor {
  startTime: number
  memoryUsage: Map<string, number>
  requestCounts: Map<string, number>
  responseTimes: Map<string, number[]>
  recordRequest: (endpoint: string, responseTime: number) => void
  recordMemoryUsage: (component: string) => void
  getStats: () => PerformanceMonitorStats
}

export interface PerformanceThresholds {
  maxResponseTime?: number
  minSuccessRate?: number
  maxMemoryUsage?: number
  maxErrorRate?: number
}

export interface PerformanceValidationResult {
  passed: boolean
  violations: string[]
  metrics: PerformanceMonitorStats
}

export interface ReadyAwareService {
  ready?: () => boolean
}

export interface IntegrationTestConfig {
  environment: 'development' | 'staging' | 'production'
  services: {
    cloudflareWorkers: boolean
    kvStorage: boolean
    analytics: boolean
    ai: boolean
    cdn: boolean
    tunnel: boolean
  }
  endpoints: {
    api: string
    cdn: string
    workers: string
    analytics: string
  }
  timeouts: {
    api: number
    worker: number
    sync: number
    ai: number
  }
  limits: {
    maxConcurrentRequests: number
    maxTestDuration: number
    maxMemoryUsage: number
  }
}

export interface TestEnvironment {
  config: IntegrationTestConfig
  services: Map<string, unknown>
  mocks: Map<string, unknown>
  cleanup: Array<() => Promise<void>>
}
