import type { AggregatedMetrics } from '../performance-monitor.ts'

export interface HealingMetricsSnapshot {
  cache: {
    hitRate: number
  }
  performance: Record<string, AggregatedMetrics>
  memory: {
    usage: number
  }
  ai: {
    consecutiveFailures: number
  }
  kv: {
    errorRate: number
  }
}

export type HealingPriority = 'critical' | 'high' | 'medium' | 'low'

export type HealingSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface HealingRule {
  id: string
  name: string
  description: string
  condition: (metrics: HealingMetricsSnapshot) => boolean
  action: () => Promise<void> | void
  cooldown: number
  priority: HealingPriority
  maxRetries: number
}

export interface HealingEvent {
  id: string
  timestamp: number
  ruleId: string
  ruleName: string
  severity: HealingSeverity
  description: string
  action: string
  success: boolean
  duration: number
  error?: string
}

export interface HealingStats {
  totalHealings: number
  successfulHealings: number
  failedHealings: number
  avgHealingTime: number
}

export interface HealingStatus {
  isActive: boolean
  rulesCount: number
  recentEvents: HealingEvent[]
  healingStats: HealingStats
}

export interface HealingActions {
  clearExpiredCache: () => Promise<void> | void
  forceAutoTuning: () => Promise<void> | void
  restartAIService: () => Promise<void> | void
  cleanupDictionaryCache: () => Promise<void> | void
  switchToBackupAIModel: () => Promise<void> | void
  retryKVOperations: () => Promise<void> | void
}
