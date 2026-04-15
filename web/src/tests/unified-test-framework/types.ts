import { vi } from 'vitest'
import type { MockFactory } from './mockFactory'

export type MockMethod = (...args: never[]) => unknown | Promise<unknown>
export type MockMethods = Record<string, MockMethod>
export type MockApi = ReturnType<typeof vi.fn> & Record<string, unknown>

export type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

export interface IntegrationScenario<TResult = unknown> {
  description: string
  setupMocks?: (mockFactory: MockFactory) => void
  execute: () => Promise<TResult>
  assertions: Array<(result: TResult) => void>
  cleanup?: () => void
}

export interface E2EScenario<TResult = unknown> {
  description: string
  setup: () => Promise<void>
  execute: () => Promise<TResult>
  verify: (result: TResult) => Promise<void>
  cleanup: () => Promise<void>
}

export interface BenchmarkOptions {
  iterations?: number
  warmupIterations?: number
  timeout?: number
}

export interface LoadTestOptions {
  concurrentUsers?: number
  duration?: number
  rampUpTime?: number
}

export interface PerformanceMetrics {
  totalTime: number
  averageTime: number
  minTime: number
  maxTime: number
  memoryDelta: number
  iterations: number
}

export interface LoadTestResult {
  userId: number
  success: boolean
  responseTime: number
  error?: string
}
