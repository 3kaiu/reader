import type {
  AutoTunerConfig,
  CurrentSystemMetrics,
  OperationMetric,
  TuningDecision,
  TuningHistoryEntry,
} from './types.ts'

export function getTotalRequests(metrics: Record<string, OperationMetric>): number {
  return Object.values(metrics).reduce((sum, metric) => sum + metric.totalRequests, 0)
}

export function calculateCurrentMetrics(
  metrics: Record<string, OperationMetric>
): CurrentSystemMetrics | null {
  const operations = Object.values(metrics)
  if (operations.length === 0) return null

  const weights = operations.map(operation => operation.totalRequests)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight === 0) return null

  return {
    avgResponseTime: operations.reduce(
      (sum, operation, index) => sum + (operation.avgDuration * weights[index]),
      0
    ) / totalWeight,
    avgErrorRate: operations.reduce(
      (sum, operation, index) => sum + (operation.errorRate * weights[index]),
      0
    ) / totalWeight,
    totalRequests: totalWeight,
    cacheHitRate: 0.75,
    qps: operations.reduce(
      (sum, operation, index) => sum + (operation.qps * weights[index]),
      0
    ) / totalWeight,
  }
}

export function analyzePerformance(
  currentMetrics: CurrentSystemMetrics | null,
  config: AutoTunerConfig
): TuningDecision[] {
  if (!currentMetrics) {
    return []
  }

  const decisions: TuningDecision[] = []

  if (currentMetrics.avgResponseTime > config.performanceThresholds.targetResponseTime * 1.5) {
    decisions.push({
      parameter: 'cache.ttl',
      direction: 'increase',
      reason: '响应时间过长，增加缓存时间',
      confidence: 0.8,
    })

    decisions.push({
      parameter: 'concurrency.maxConcurrentRequests',
      direction: 'increase',
      reason: '响应时间过长，增加并发处理',
      confidence: 0.7,
    })
  }

  if (currentMetrics.cacheHitRate < config.performanceThresholds.targetCacheHitRate * 0.8) {
    decisions.push({
      parameter: 'cache.hitRateThreshold',
      direction: 'decrease',
      reason: '缓存命中率过低，放宽命中阈值',
      confidence: 0.9,
    })
  }

  if (currentMetrics.avgErrorRate > config.performanceThresholds.targetErrorRate * 2) {
    decisions.push({
      parameter: 'ai.maxCallsPerMinute',
      direction: 'decrease',
      reason: '错误率过高，减少AI调用频率',
      confidence: 0.8,
    })

    decisions.push({
      parameter: 'ai.confidenceThreshold',
      direction: 'increase',
      reason: '错误率过高，提高AI置信度阈值',
      confidence: 0.7,
    })
  }

  if (currentMetrics.qps > 100) {
    decisions.push({
      parameter: 'dict.maxGlobalEntries',
      direction: 'decrease',
      reason: '高负载情况下减少内存使用',
      confidence: 0.6,
    })

    decisions.push({
      parameter: 'dict.maxBookEntries',
      direction: 'decrease',
      reason: '高负载情况下减少内存使用',
      confidence: 0.6,
    })
  }

  return decisions.filter(decision => decision.confidence > 0.6)
}

export function getStatusRecommendations(history: TuningHistoryEntry[]): string[] {
  const recommendations: string[] = []
  const recentTuning = history.slice(-5)
  if (recentTuning.length === 0) {
    return recommendations
  }

  const mostTunedParam = recentTuning.reduce((acc, current) => {
    acc[current.parameter] = (acc[current.parameter] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const topParam = Object.entries(mostTunedParam)
    .sort(([, a], [, b]) => b - a)[0]

  if (topParam && topParam[1] > 2) {
    recommendations.push(`频繁调整参数 ${topParam[0]}，考虑手动优化该参数`)
  }

  return recommendations
}
