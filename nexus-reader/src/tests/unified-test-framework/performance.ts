import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TEST_CONFIG } from './config'
import { getUsedHeapSize } from './helpers'
import type {
  BenchmarkOptions,
  LoadTestOptions,
  LoadTestResult,
  PerformanceMetrics,
} from './types'

export class PerformanceTestFramework {
  static async benchmark<TResult>(
    operationName: string,
    operation: () => Promise<TResult>,
    options: BenchmarkOptions = {}
  ) {
    const {
      iterations = 100,
      warmupIterations = 10,
    } = options

    describe(`${operationName} - Performance Benchmark`, () => {
      let metrics: PerformanceMetrics

      beforeAll(async () => {
        for (let i = 0; i < warmupIterations; i++) {
          await operation()
        }

        const startTime = performance.now()
        const startMemory = getUsedHeapSize()
        const results: number[] = []

        for (let i = 0; i < iterations; i++) {
          const opStart = performance.now()
          await operation()
          const opEnd = performance.now()
          results.push(opEnd - opStart)
        }

        const endTime = performance.now()
        const endMemory = getUsedHeapSize()

        metrics = {
          totalTime: endTime - startTime,
          averageTime: results.reduce((a, b) => a + b, 0) / results.length,
          minTime: Math.min(...results),
          maxTime: Math.max(...results),
          memoryDelta: endMemory - startMemory,
          iterations,
        }
      })

      it('should meet performance thresholds', () => {
        expect(metrics.averageTime).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLD.responseTime)
        expect(metrics.memoryDelta).toBeLessThan(TEST_CONFIG.PERFORMANCE_THRESHOLD.memoryUsage)
      })

      it('should have consistent performance', () => {
        const variance = metrics.maxTime - metrics.minTime
        const coefficientOfVariation = variance / metrics.averageTime
        expect(coefficientOfVariation).toBeLessThan(0.5)
      })

      afterAll(() => {
        console.log(`${operationName} Performance Metrics:`, metrics)
      })
    })
  }

  static async loadTest<TResult>(
    operationName: string,
    operation: () => Promise<TResult>,
    options: LoadTestOptions = {}
  ) {
    const {
      concurrentUsers = TEST_CONFIG.LOAD_TEST.concurrentUsers,
      duration = TEST_CONFIG.LOAD_TEST.duration,
      rampUpTime = TEST_CONFIG.LOAD_TEST.rampUpTime,
    } = options

    describe(`${operationName} - Load Test`, () => {
      it('should handle concurrent load', async () => {
        const results: LoadTestResult[] = []
        const startTime = Date.now()
        const rampUpSteps = 5
        const usersPerStep = Math.ceil(concurrentUsers / rampUpSteps)

        for (let step = 0; step < rampUpSteps; step++) {
          const stepUsers = Math.min(usersPerStep * (step + 1), concurrentUsers)
          const stepPromises = Array.from({ length: stepUsers }, async (_, i) => {
            const userStart = Date.now()

            try {
              await operation()
              return {
                userId: i,
                success: true,
                responseTime: Date.now() - userStart,
              }
            } catch (error: unknown) {
              return {
                userId: i,
                success: false,
                responseTime: Date.now() - userStart,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          })

          const stepResults = await Promise.all(stepPromises)
          results.push(...stepResults)

          if (step < rampUpSteps - 1) {
            await new Promise(resolve => setTimeout(resolve, rampUpTime / rampUpSteps))
          }
        }

        const endTime = Date.now()
        const totalTime = endTime - startTime
        const successfulRequests = results.filter(result => result.success).length
        const failedRequests = results.filter(result => !result.success).length
        const averageResponseTime = results.reduce((sum, result) => sum + result.responseTime, 0) / results.length
        const successRate = successfulRequests / results.length

        expect(successRate).toBeGreaterThan(0.95)
        expect(averageResponseTime).toBeLessThan(2000)

        console.log(`${operationName} Load Test Results:`, {
          totalRequests: results.length,
          successfulRequests,
          failedRequests,
          successRate: `${(successRate * 100).toFixed(2)}%`,
          averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
          totalTime: `${totalTime}ms`,
        })
      }, duration + 10000)
    })
  }
}
