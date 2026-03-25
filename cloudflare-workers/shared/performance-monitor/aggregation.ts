import type {
  AggregatedMetrics,
  AlertThresholds,
  BottleneckAnalysis,
  PerformanceMetrics,
} from './types.ts'

export function cleanupMetrics(
  metrics: PerformanceMetrics[],
  aggregationWindow: number,
  maxMetrics: number
): {
  metrics: PerformanceMetrics[]
  cleanedCount: number
} {
  const cutoff = Date.now() - aggregationWindow * 10
  let nextMetrics = metrics.filter(metric => metric.timestamp > cutoff)

  if (nextMetrics.length > maxMetrics) {
    nextMetrics = nextMetrics.slice(-maxMetrics)
  }

  return {
    metrics: nextMetrics,
    cleanedCount: metrics.length - nextMetrics.length,
  }
}

export function aggregateMetrics(
  metrics: PerformanceMetrics[],
  timeRange: number
): Record<string, AggregatedMetrics> {
  const cutoff = Date.now() - timeRange
  const operations = new Map<string, PerformanceMetrics[]>()

  for (const metric of metrics) {
    if (metric.timestamp < cutoff) {
      continue
    }

    const list = operations.get(metric.operation) || []
    list.push(metric)
    operations.set(metric.operation, list)
  }

  const result: Record<string, AggregatedMetrics> = {}

  for (const [operation, operationMetrics] of operations) {
    const durations = operationMetrics.map(metric => metric.duration).sort((a, b) => a - b)
    const successful = operationMetrics.filter(metric => metric.success)
    const failed = operationMetrics.filter(metric => !metric.success)

    result[operation] = {
      operation,
      totalRequests: operationMetrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
      p99Duration: durations[Math.floor(durations.length * 0.99)] || 0,
      errorRate: failed.length / operationMetrics.length,
      qps: operationMetrics.length / (timeRange / 1000),
    }
  }

  return result
}

export function getRecentErrors(metrics: PerformanceMetrics[], limit = 10): PerformanceMetrics[] {
  return metrics
    .filter(metric => !metric.success)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
}

export function getSlowRequests(
  metrics: PerformanceMetrics[],
  threshold = 1000,
  limit = 10
): PerformanceMetrics[] {
  return metrics
    .filter(metric => metric.duration > threshold)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, limit)
}

export function calculateHealthScore(
  aggregatedMetrics: Record<string, AggregatedMetrics>,
  thresholds: AlertThresholds
): number {
  let totalScore = 0
  let operationCount = 0

  for (const metric of Object.values(aggregatedMetrics)) {
    let score = 100

    score -= metric.errorRate * 50

    if (metric.p95Duration > 2000) {
      score -= 20
    } else if (metric.p95Duration > 1000) {
      score -= 10
    }

    if (metric.qps > thresholds.qps) {
      score -= 10
    }

    totalScore += Math.max(0, score)
    operationCount++
  }

  return operationCount > 0 ? totalScore / operationCount : 100
}

export function analyzeBottlenecks(
  aggregatedMetrics: Record<string, AggregatedMetrics>,
  healthScore: number
): BottleneckAnalysis {
  const operations = Object.values(aggregatedMetrics)
  const recommendations: string[] = []

  const slowestOperations = [...operations]
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 3)
    .map(operation => operation.operation)

  const highestErrorOperations = [...operations]
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 3)
    .map(operation => operation.operation)

  const mostFrequentOperations = [...operations]
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, 3)
    .map(operation => operation.operation)

  for (const operation of slowestOperations) {
    recommendations.push(`考虑优化 ${operation} 的性能，可以考虑缓存或异步处理`)
  }

  for (const operation of highestErrorOperations) {
    recommendations.push(`调查 ${operation} 的错误原因，错误率过高`)
  }

  for (const operation of mostFrequentOperations) {
    recommendations.push(`考虑对高频操作 ${operation} 增加缓存层`)
  }

  if (healthScore < 70) {
    recommendations.push('整体系统健康度较低，建议全面检查性能瓶颈')
  }

  return {
    slowestOperations,
    highestErrorOperations,
    mostFrequentOperations,
    recommendations,
  }
}
