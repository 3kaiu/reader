/**
 * Performance Monitor (性能监控服务)
 * 提供实时性能指标收集、分析和告警
 */

export interface PerformanceMetrics {
  timestamp: number;
  requestId: string;
  operation: string;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface AggregatedMetrics {
  operation: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgDuration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
  qps: number; // queries per second
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 10000; // 最多保留1万条指标
  private aggregationWindow = 60000; // 1分钟聚合窗口
  private alertThresholds = {
    errorRate: 0.1, // 10%错误率
    p95Duration: 5000, // 5秒95分位数
    qps: 100 // 每秒100请求
  };

  record(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      requestId: crypto.randomUUID(),
      operation,
      duration,
      success,
      metadata
    };

    this.metrics.push(metric);

    // 清理过期指标
    this.cleanupOldMetrics();

    // 检查告警阈值
    this.checkAlerts(metric);
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.aggregationWindow * 10; // 保留10分钟的数据
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

    // 如果仍然太多，保留最新的
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  private checkAlerts(metric: PerformanceMetrics): void {
    // 简单的告警逻辑，可以扩展为更复杂的规则
    if (!metric.success && metric.operation.includes('ai')) {
      console.warn(`AI operation failed: ${metric.operation}`);
    }

    if (metric.duration > this.alertThresholds.p95Duration) {
      console.warn(`Slow operation detected: ${metric.operation} took ${metric.duration}ms`);
    }
  }

  getAggregatedMetrics(timeRange = this.aggregationWindow): Record<string, AggregatedMetrics> {
    const now = Date.now();
    const cutoff = now - timeRange;

    const operations = new Map<string, PerformanceMetrics[]>();

    // 按操作分组
    for (const metric of this.metrics) {
      if (metric.timestamp < cutoff) continue;

      const list = operations.get(metric.operation) || [];
      list.push(metric);
      operations.set(metric.operation, list);
    }

    const result: Record<string, AggregatedMetrics> = {};

    for (const [operation, metrics] of operations) {
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const successful = metrics.filter(m => m.success);
      const failed = metrics.filter(m => !m.success);

      result[operation] = {
        operation,
        totalRequests: metrics.length,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95Duration: durations[Math.floor(durations.length * 0.95)] || 0,
        p99Duration: durations[Math.floor(durations.length * 0.99)] || 0,
        errorRate: failed.length / metrics.length,
        qps: metrics.length / (timeRange / 1000)
      };
    }

    return result;
  }

  getRecentErrors(limit = 10): PerformanceMetrics[] {
    return this.metrics
      .filter(m => !m.success)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getSlowRequests(threshold = 1000, limit = 10): PerformanceMetrics[] {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getHealthScore(): number {
    const metrics = this.getAggregatedMetrics();

    let totalScore = 0;
    let operationCount = 0;

    for (const agg of Object.values(metrics)) {
      let score = 100;

      // 错误率影响
      score -= agg.errorRate * 50;

      // 响应时间影响
      if (agg.p95Duration > 2000) score -= 20;
      else if (agg.p95Duration > 1000) score -= 10;

      // QPS影响（过高可能表示问题）
      if (agg.qps > this.alertThresholds.qps) score -= 10;

      totalScore += Math.max(0, score);
      operationCount++;
    }

    return operationCount > 0 ? totalScore / operationCount : 100;
  }

  exportMetrics(): {
    timestamp: number;
    metrics: PerformanceMetrics[];
    aggregated: Record<string, AggregatedMetrics>;
    healthScore: number;
    alerts: string[];
  } {
    const alerts: string[] = [];
    const aggregated = this.getAggregatedMetrics();

    // 生成告警
    for (const [operation, agg] of Object.entries(aggregated)) {
      if (agg.errorRate > this.alertThresholds.errorRate) {
        alerts.push(`${operation}: error rate ${agg.errorRate.toFixed(2)} > ${this.alertThresholds.errorRate}`);
      }
      if (agg.p95Duration > this.alertThresholds.p95Duration) {
        alerts.push(`${operation}: P95 duration ${agg.p95Duration}ms > ${this.alertThresholds.p95Duration}ms`);
      }
      if (agg.qps > this.alertThresholds.qps) {
        alerts.push(`${operation}: QPS ${agg.qps.toFixed(1)} > ${this.alertThresholds.qps}`);
      }
    }

    return {
      timestamp: Date.now(),
      metrics: this.metrics.slice(-100), // 只导出最近100条
      aggregated,
      healthScore: this.getHealthScore(),
      alerts
    };
  }

  // 性能分析工具
  analyzeBottlenecks(): {
    slowestOperations: string[];
    highestErrorOperations: string[];
    mostFrequentOperations: string[];
    recommendations: string[];
  } {
    const aggregated = this.getAggregatedMetrics();

    const operations = Object.values(aggregated);
    const recommendations: string[] = [];

    // 最慢操作
    const slowestOperations = operations
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 3)
      .map(op => op.operation);

    // 最高错误率操作
    const highestErrorOperations = operations
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 3)
      .map(op => op.operation);

    // 最频繁操作
    const mostFrequentOperations = operations
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 3)
      .map(op => op.operation);

    // 生成建议
    for (const op of slowestOperations) {
      recommendations.push(`考虑优化 ${op} 的性能，可以考虑缓存或异步处理`);
    }

    for (const op of highestErrorOperations) {
      recommendations.push(`调查 ${op} 的错误原因，错误率过高`);
    }

    for (const op of mostFrequentOperations) {
      recommendations.push(`考虑对高频操作 ${op} 增加缓存层`);
    }

    const healthScore = this.getHealthScore();
    if (healthScore < 70) {
      recommendations.push('整体系统健康度较低，建议全面检查性能瓶颈');
    }

    return {
      slowestOperations,
      highestErrorOperations,
      mostFrequentOperations,
      recommendations
    };
  }
}

// 全局性能监控实例
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

// 性能监控装饰器
export function withPerformanceMonitoring(operation: string) {
  return function <T extends any[], R>(
    target: (this: any, ...args: T) => Promise<R>,
    context: ClassMethodDecoratorContext
  ) {
    return async function (this: any, ...args: T): Promise<R> {
      const monitor = getPerformanceMonitor();
      const startTime = Date.now();

      try {
        const result = await target.apply(this, args);
        monitor.record(operation, Date.now() - startTime, true, {
          method: context.name,
          argsCount: args.length
        });
        return result;
      } catch (error) {
        monitor.record(operation, Date.now() - startTime, false, {
          method: context.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    };
  };
}