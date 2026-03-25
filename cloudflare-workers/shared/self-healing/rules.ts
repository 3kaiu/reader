import type {
  HealingActions,
  HealingMetricsSnapshot,
  HealingPriority,
  HealingRule,
  HealingSeverity,
} from './types.ts'

const priorityOrder: Record<HealingPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export function createDefaultHealingRules(actions: HealingActions): HealingRule[] {
  return [
    {
      id: 'cache-hit-rate-low',
      name: '缓存命中率过低',
      description: '缓存命中率低于阈值，可能影响性能',
      condition: (metrics) => metrics.cache.hitRate > 0 && metrics.cache.hitRate < 0.5,
      action: () => actions.clearExpiredCache(),
      cooldown: 300000,
      priority: 'medium',
      maxRetries: 3,
    },
    {
      id: 'high-response-time',
      name: '响应时间过长',
      description: '平均响应时间超过1秒',
      condition: (metrics) => {
        const decodeMetrics = metrics.performance.decode_process
        return Boolean(decodeMetrics && decodeMetrics.avgDuration > 1000)
      },
      action: () => actions.forceAutoTuning(),
      cooldown: 180000,
      priority: 'high',
      maxRetries: 5,
    },
    {
      id: 'high-error-rate',
      name: '错误率过高',
      description: '错误率超过5%',
      condition: (metrics) => {
        const operations = Object.values(metrics.performance) as Array<{ errorRate?: number }>
        if (operations.length === 0) {
          return false
        }

        const avgErrorRate = operations.reduce(
          (sum: number, operation) => sum + (operation.errorRate || 0),
          0
        ) / operations.length

        return avgErrorRate > 0.05
      },
      action: () => actions.restartAIService(),
      cooldown: 600000,
      priority: 'critical',
      maxRetries: 2,
    },
    {
      id: 'high-memory-usage',
      name: '内存使用过高',
      description: '内存使用率超过80%',
      condition: (metrics) => metrics.memory.usage > 0.8,
      action: () => actions.cleanupDictionaryCache(),
      cooldown: 120000,
      priority: 'high',
      maxRetries: 3,
    },
    {
      id: 'ai-service-unavailable',
      name: 'AI服务不可用',
      description: 'AI服务连续失败',
      condition: (metrics) => metrics.ai.consecutiveFailures > 5,
      action: () => actions.switchToBackupAIModel(),
      cooldown: 30000,
      priority: 'critical',
      maxRetries: 1,
    },
    {
      id: 'kv-storage-errors',
      name: 'KV存储错误',
      description: 'KV存储操作连续失败',
      condition: (metrics) => metrics.kv.errorRate > 0.1,
      action: () => actions.retryKVOperations(),
      cooldown: 60000,
      priority: 'critical',
      maxRetries: 2,
    },
  ]
}

export function isRuleTriggered(
  rule: HealingRule,
  metrics: HealingMetricsSnapshot,
  lastHealingTime: number,
  now = Date.now()
): boolean {
  if (now - lastHealingTime < rule.cooldown) {
    return false
  }

  try {
    return rule.condition(metrics)
  } catch (error) {
    console.error(`Rule ${rule.id} condition check failed:`, error)
    return false
  }
}

export function sortHealingRules(rules: HealingRule[]): HealingRule[] {
  return [...rules].sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
}

export function getSeverityForPriority(priority: HealingPriority): HealingSeverity {
  if (priority === 'critical') {
    return 'critical'
  }

  if (priority === 'high') {
    return 'error'
  }

  if (priority === 'medium') {
    return 'warning'
  }

  return 'info'
}
