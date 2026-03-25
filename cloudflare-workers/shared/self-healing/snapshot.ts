import {
  getPerformanceMonitor,
  type PerformanceMetrics,
} from '../performance-monitor.ts'
import type { HealingMetricsSnapshot } from './types.ts'

function countRecentFailures(
  metrics: PerformanceMetrics[],
  matchesOperation: (metric: PerformanceMetrics) => boolean
): number {
  const relevant = metrics
    .filter(matchesOperation)
    .sort((a, b) => b.timestamp - a.timestamp)

  let consecutiveFailures = 0
  for (const metric of relevant) {
    if (!metric.success) {
      consecutiveFailures++
      continue
    }
    break
  }

  return consecutiveFailures
}

export function buildMetricsSnapshot(): HealingMetricsSnapshot {
  const exported = getPerformanceMonitor().exportMetrics()
  const performance = exported.aggregated
  const decodeRequests = performance.decode_process?.totalRequests || 0
  const decodeCacheHits = performance.decode_cache_hit?.totalRequests || 0
  const cacheHitRate = decodeRequests > 0 ? decodeCacheHits / decodeRequests : 1
  const kvMetrics = Object.values(performance).filter(metric =>
    metric.operation.toLowerCase().includes('kv')
  )
  const kvErrorRate = kvMetrics.length > 0
    ? kvMetrics.reduce((sum, metric) => sum + metric.errorRate, 0) / kvMetrics.length
    : 0

  return {
    cache: {
      hitRate: cacheHitRate,
    },
    performance,
    memory: {
      usage: 0,
    },
    ai: {
      consecutiveFailures: countRecentFailures(
        exported.metrics,
        metric => metric.operation.toLowerCase().includes('ai')
      ),
    },
    kv: {
      errorRate: kvErrorRate,
    },
  }
}
