export interface OperationMetric {
  totalRequests: number
  avgDuration: number
  errorRate: number
  qps: number
}

export interface CurrentSystemMetrics {
  avgResponseTime: number
  avgErrorRate: number
  totalRequests: number
  cacheHitRate: number
  qps: number
}

export interface TuningDecision {
  parameter: string
  direction: 'increase' | 'decrease'
  reason: string
  confidence: number
}

export interface TuningHistoryEntry {
  timestamp: number
  parameter: string
  oldValue: number
  newValue: number
  reason: string
  impact: number
}

export interface TuningStatus {
  isActive: boolean
  lastTuningTime: number
  tuningHistory: TuningHistoryEntry[]
  currentParameters: Record<string, number>
  recommendations: string[]
}

export type MutableDecodeCacheConfig = {
  ttl: number
  hitRateThreshold: number
}

export interface AutoTunerConfig {
  tuningInterval: number
  minSamples: number
  performanceThresholds: {
    targetResponseTime: number
    targetCacheHitRate: number
    targetErrorRate: number
    maxCpuUsage: number
    maxMemoryUsage: number
  }
  tuningStrategy: {
    aggressive: boolean
    stepSize: number
    maxAdjustment: number
    cooldownPeriod: number
  }
}

export interface TunableParameter {
  name: string
  currentValue: number
  minValue: number
  maxValue: number
  step: number
  description: string
  impact: 'performance' | 'memory' | 'accuracy' | 'cost'
}
