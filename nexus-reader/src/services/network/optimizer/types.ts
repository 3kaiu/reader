export interface NetworkInfo {
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g' | 'unknown'
  downlink: number
  rtt: number
  saveData: boolean
  isOnline: boolean
  connectionType: string
}

export interface NetworkConnectionLike {
  effectiveType?: NetworkInfo['effectiveType']
  downlink?: number
  rtt?: number
  saveData?: boolean
  type?: string
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

export interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnectionLike
}

export interface RetryableResponseLike {
  headers?: Headers | Record<string, unknown> | { get?: (name: string) => unknown }
}

export interface RetryableErrorLike {
  response?: RetryableResponseLike
  message?: string
}

export type PerformanceMetricContext = Record<string, unknown>

export interface PerformanceMonitorLike {
  reportMetric: (name: string, value: number, context?: PerformanceMetricContext) => void
}

export interface RequestOptimizationConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  jitterFactor: number
  timeout: number
}

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline'
