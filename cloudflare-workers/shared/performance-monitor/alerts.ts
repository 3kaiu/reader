import type {
  AggregatedMetrics,
  AlertThresholds,
  PerformanceMetrics,
} from './types.ts'

export function checkMetricAlerts(metric: PerformanceMetrics, thresholds: AlertThresholds): void {
  if (!metric.success && metric.operation.includes('ai')) {
    console.warn(`AI operation failed: ${metric.operation}`)
  }

  if (metric.duration > thresholds.p95Duration) {
    console.warn(`Slow operation detected: ${metric.operation} took ${metric.duration}ms`)
  }
}

export function buildAggregatedAlerts(
  aggregatedMetrics: Record<string, AggregatedMetrics>,
  thresholds: AlertThresholds
): string[] {
  const alerts: string[] = []

  for (const [operation, metric] of Object.entries(aggregatedMetrics)) {
    if (metric.errorRate > thresholds.errorRate) {
      alerts.push(`${operation}: error rate ${metric.errorRate.toFixed(2)} > ${thresholds.errorRate}`)
    }

    if (metric.p95Duration > thresholds.p95Duration) {
      alerts.push(`${operation}: P95 duration ${metric.p95Duration}ms > ${thresholds.p95Duration}ms`)
    }

    if (metric.qps > thresholds.qps) {
      alerts.push(`${operation}: QPS ${metric.qps.toFixed(1)} > ${thresholds.qps}`)
    }
  }

  return alerts
}
