import type {
  PerformanceWithMemory,
  ServerlessBottleneck,
  ServerlessConfig,
  ServerlessMetrics,
} from './types.ts'

export class ServerlessMetricsCollector {
  async collectMetrics(): Promise<ServerlessMetrics> {
    const startTime = Date.now()

    return {
      coldStartTime: await this.measureColdStartTime(),
      executionTime: Date.now() - startTime,
      memoryUsage: await this.getMemoryUsage(),
      cpuTime: await this.getCpuTime(),
      networkLatency: await this.getNetworkLatency(),
      errorRate: await this.getErrorRate(),
      requestCount: await this.getRequestCount(),
      cacheHitRate: await this.getCacheHitRate(),
    }
  }

  private async measureColdStartTime(): Promise<number> {
    const start = performance.now()
    await new Promise(resolve => setTimeout(resolve, 1))
    return performance.now() - start
  }

  private async getMemoryUsage(): Promise<number> {
    const performanceWithMemory = performance as PerformanceWithMemory
    if (typeof performance !== 'undefined' && performanceWithMemory.memory) {
      return performanceWithMemory.memory.usedJSHeapSize / (1024 * 1024)
    }
    return 0
  }

  private async getCpuTime(): Promise<number> {
    return 0
  }

  private async getNetworkLatency(): Promise<number> {
    return 100
  }

  private async getErrorRate(): Promise<number> {
    return 0.02
  }

  private async getRequestCount(): Promise<number> {
    return 1000
  }

  private async getCacheHitRate(): Promise<number> {
    return 0.85
  }
}

export function analyzeBottlenecks(
  metrics: ServerlessMetrics,
  config: ServerlessConfig
): ServerlessBottleneck[] {
  const bottlenecks: ServerlessBottleneck[] = []

  if (metrics.coldStartTime > 1000) {
    bottlenecks.push('cold_start')
  }

  if (metrics.memoryUsage > config.memoryLimit * 0.8) {
    bottlenecks.push('memory_pressure')
  }

  if (metrics.cpuTime > config.cpuLimit) {
    bottlenecks.push('cpu_pressure')
  }

  if (metrics.networkLatency > 500) {
    bottlenecks.push('network_latency')
  }

  if (metrics.errorRate > 0.05) {
    bottlenecks.push('high_error_rate')
  }

  if (metrics.cacheHitRate < 0.7) {
    bottlenecks.push('low_cache_hit_rate')
  }

  return bottlenecks
}
