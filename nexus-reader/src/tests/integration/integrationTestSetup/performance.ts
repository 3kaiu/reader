import type {
  LoadTestAccumulator,
  LoadTestOptions,
  LoadTestSummary,
  PerformanceMonitorStats,
  PerformanceThresholds,
  PerformanceValidationResult,
  TestPerformanceMonitor,
} from './types'

export function createPerformanceMonitor(): TestPerformanceMonitor {
  const performanceMonitor: TestPerformanceMonitor = {
    startTime: Date.now(),
    memoryUsage: new Map<string, number>(),
    requestCounts: new Map<string, number>(),
    responseTimes: new Map<string, number[]>(),
    recordRequest: (endpoint: string, responseTime: number) => {
      const times = performanceMonitor.responseTimes.get(endpoint) || []
      times.push(responseTime)
      performanceMonitor.responseTimes.set(endpoint, times)

      const count = performanceMonitor.requestCounts.get(endpoint) || 0
      performanceMonitor.requestCounts.set(endpoint, count + 1)
    },
    recordMemoryUsage: (component: string) => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage()
        performanceMonitor.memoryUsage.set(component, usage.heapUsed)
      }
    },
    getStats: () => ({
      duration: Date.now() - performanceMonitor.startTime,
      requests: Object.fromEntries(performanceMonitor.requestCounts),
      averageResponseTimes: Object.fromEntries(
        Array.from(performanceMonitor.responseTimes.entries()).map(([endpoint, times]) => [
          endpoint,
          times.reduce((a, b) => a + b, 0) / times.length,
        ])
      ),
      memoryUsage: Object.fromEntries(performanceMonitor.memoryUsage),
    }),
  }

  return performanceMonitor
}

async function loadTestWorker(
  endpoint: string,
  endTime: number,
  requestsPerSecond: number,
  results: LoadTestAccumulator
): Promise<void> {
  const interval = 1000 / requestsPerSecond

  while (Date.now() < endTime) {
    const requestStart = Date.now()

    try {
      const response = await fetch(endpoint)
      const responseTime = Date.now() - requestStart

      results.totalRequests++
      results.responseTimes.push(responseTime)

      if (response.ok) {
        results.successfulRequests++
      } else {
        results.failedRequests++
      }
    } catch {
      results.totalRequests++
      results.failedRequests++
      results.responseTimes.push(Date.now() - requestStart)
    }

    const elapsed = Date.now() - requestStart
    const waitTime = Math.max(0, interval - elapsed)
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
}

export async function runLoadTest(options: LoadTestOptions): Promise<LoadTestSummary> {
  const { endpoint, concurrency, duration, requestsPerSecond = 10 } = options
  const startTime = Date.now()
  const endTime = startTime + duration
  const results: LoadTestAccumulator = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [],
  }

  const workers: Array<Promise<void>> = []
  for (let index = 0; index < concurrency; index++) {
    workers.push(loadTestWorker(endpoint, endTime, requestsPerSecond, results))
  }

  await Promise.all(workers)

  const responseTimes = results.responseTimes
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0

  return {
    totalRequests: results.totalRequests,
    successfulRequests: results.successfulRequests,
    failedRequests: results.failedRequests,
    averageResponseTime,
    maxResponseTime: Math.max(...responseTimes, 0),
    minResponseTime: Math.min(...responseTimes, 0),
    requestsPerSecond: results.totalRequests / (duration / 1000),
  }
}

export function validatePerformance(
  performance: TestPerformanceMonitor | undefined,
  thresholds: PerformanceThresholds
): PerformanceValidationResult {
  const stats: PerformanceMonitorStats = performance?.getStats() || {
    duration: 0,
    requests: {},
    averageResponseTimes: {},
    memoryUsage: {},
  }

  const violations: string[] = []

  if (thresholds.maxResponseTime) {
    const averageTimes = stats.averageResponseTimes || {}
    Object.entries(averageTimes).forEach(([endpoint, averageTime]) => {
      if ((averageTime as number) > thresholds.maxResponseTime!) {
        violations.push(
          `${endpoint} average response time ${averageTime}ms exceeds ${thresholds.maxResponseTime}ms`
        )
      }
    })
  }

  if (thresholds.maxMemoryUsage) {
    const memoryUsage = stats.memoryUsage || {}
    Object.entries(memoryUsage).forEach(([component, usage]) => {
      if ((usage as number) > thresholds.maxMemoryUsage!) {
        violations.push(
          `${component} memory usage ${usage} bytes exceeds ${thresholds.maxMemoryUsage} bytes`
        )
      }
    })
  }

  return {
    passed: violations.length === 0,
    violations,
    metrics: stats,
  }
}
