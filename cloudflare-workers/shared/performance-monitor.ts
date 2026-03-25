/**
 * Performance Monitor (性能监控服务)
 * 提供实时性能指标收集、分析和告警
 */

import {
  aggregateMetrics,
  analyzeBottlenecks as analyzeMetricBottlenecks,
  calculateHealthScore,
  cleanupMetrics,
  getRecentErrors as selectRecentErrors,
  getSlowRequests as selectSlowRequests,
} from './performance-monitor/aggregation.ts'
import {
  buildAggregatedAlerts,
  checkMetricAlerts,
} from './performance-monitor/alerts.ts'
import { withPerformanceMonitoring as createPerformanceDecorator } from './performance-monitor/decorator.ts'
import type {
  AggregatedMetrics,
  AlertThresholds,
  BottleneckAnalysis,
  PerformanceMetrics,
  PerformanceMetricsExport,
} from './performance-monitor/types.ts'

export type {
  AggregatedMetrics,
  AlertThresholds,
  BottleneckAnalysis,
  PerformanceMetrics,
  PerformanceMetricsExport,
} from './performance-monitor/types.ts'

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = []
  private maxMetrics = 10000
  private aggregationWindow = 60000
  private cleanupInterval = 5 * 60 * 1000
  private lastCleanup = Date.now()
  private alertThresholds: AlertThresholds = {
    errorRate: 0.1,
    p95Duration: 5000,
    qps: 100,
  }

  record(operation: string, duration: number, success: boolean, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      requestId: crypto.randomUUID(),
      operation,
      duration,
      success,
      metadata,
    }

    this.metrics.push(metric)

    // 定期清理过期指标
    this.cleanupIfNeeded()

    // 检查告警阈值
    this.checkAlerts(metric)
  }

  private cleanupIfNeeded(): void {
    const now = Date.now()

    // 检查是否到了清理时间或数据过多
    if (now - this.lastCleanup >= this.cleanupInterval || this.metrics.length > this.maxMetrics) {
      this.cleanupOldMetrics()
      this.lastCleanup = now
    }
  }

  private cleanupOldMetrics(): void {
    const result = cleanupMetrics(this.metrics, this.aggregationWindow, this.maxMetrics)
    this.metrics = result.metrics
    const cleanedCount = result.cleanedCount
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old performance metrics`)
    }
  }

  private checkAlerts(metric: PerformanceMetrics): void {
    checkMetricAlerts(metric, this.alertThresholds)
  }

  getAggregatedMetrics(timeRange = this.aggregationWindow): Record<string, AggregatedMetrics> {
    return aggregateMetrics(this.metrics, timeRange)
  }

  getRecentErrors(limit = 10): PerformanceMetrics[] {
    return selectRecentErrors(this.metrics, limit)
  }

  getSlowRequests(threshold = 1000, limit = 10): PerformanceMetrics[] {
    return selectSlowRequests(this.metrics, threshold, limit)
  }

  getHealthScore(): number {
    return calculateHealthScore(this.getAggregatedMetrics(), this.alertThresholds)
  }

  exportMetrics(): PerformanceMetricsExport {
    const aggregated = this.getAggregatedMetrics()
    const healthScore = this.getHealthScore()

    return {
      timestamp: Date.now(),
      metrics: this.metrics.slice(-100),
      aggregated,
      healthScore,
      alerts: buildAggregatedAlerts(aggregated, this.alertThresholds),
    }
  }

  // 性能分析工具
  analyzeBottlenecks(): BottleneckAnalysis {
    const aggregated = this.getAggregatedMetrics()
    return analyzeMetricBottlenecks(aggregated, calculateHealthScore(aggregated, this.alertThresholds))
  }
}

// 全局性能监控实例
let globalMonitor: PerformanceMonitor | null = null

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor()
  }
  return globalMonitor
}

// 性能监控装饰器
export function withPerformanceMonitoring(operation: string) {
  return createPerformanceDecorator(operation, getPerformanceMonitor)
}
