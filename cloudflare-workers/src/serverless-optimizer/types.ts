export type FunctionOptimizationType =
  | 'bundling'
  | 'caching'
  | 'computation'
  | 'memory'
  | 'network'

export type ServerlessBottleneck =
  | 'cold_start'
  | 'memory_pressure'
  | 'cpu_pressure'
  | 'network_latency'
  | 'high_error_rate'
  | 'low_cache_hit_rate'

export interface ServerlessMetrics {
  coldStartTime: number
  executionTime: number
  memoryUsage: number
  cpuTime: number
  networkLatency: number
  errorRate: number
  requestCount: number
  cacheHitRate: number
}

export interface FunctionOptimization {
  functionName: string
  optimizationType: FunctionOptimizationType
  impact: number
  implementation: () => Promise<void>
}

export interface ServerlessConfig {
  memoryLimit: number
  cpuLimit: number
  timeoutLimit: number
  concurrencyLimit: number
  cacheStrategy: 'aggressive' | 'balanced' | 'conservative'
  preloadFunctions: string[]
  optimizeBundles: boolean
}

export interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number
  }
}
