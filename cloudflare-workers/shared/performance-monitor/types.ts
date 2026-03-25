export interface PerformanceMetrics {
  timestamp: number
  requestId: string
  operation: string
  duration: number
  success: boolean
  metadata?: Record<string, unknown>
}

export interface AggregatedMetrics {
  operation: string
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  avgDuration: number
  p95Duration: number
  p99Duration: number
  errorRate: number
  qps: number
}

export interface AlertThresholds {
  errorRate: number
  p95Duration: number
  qps: number
}

export interface PerformanceMetricsExport {
  timestamp: number
  metrics: PerformanceMetrics[]
  aggregated: Record<string, AggregatedMetrics>
  healthScore: number
  alerts: string[]
}

export interface BottleneckAnalysis {
  slowestOperations: string[]
  highestErrorOperations: string[]
  mostFrequentOperations: string[]
  recommendations: string[]
}
