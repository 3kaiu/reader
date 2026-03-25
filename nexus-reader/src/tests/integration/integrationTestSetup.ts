/**
 * Integration Test Environment Setup
 *
 * Provides comprehensive integration testing infrastructure for validating
 * all system components working together across the entire stack.
 */

import { DEFAULT_CONFIG } from './integrationTestSetup/config'
import {
  createPerformanceMonitor,
  runLoadTest as executeLoadTest,
  validatePerformance as validatePerformanceMetrics,
} from './integrationTestSetup/performance'
import { waitForServicesReady } from './integrationTestSetup/readiness'
import { setupMockServices } from './integrationTestSetup/services'
import { setupTestData } from './integrationTestSetup/testData'
import { setupNetworkMocks } from './integrationTestSetup/network'
import type {
  IntegrationTestConfig,
  LoadTestOptions,
  LoadTestSummary,
  PerformanceThresholds,
  PerformanceValidationResult,
  TestPerformanceMonitor,
} from './integrationTestSetup/types'

export type {
  IntegrationTestConfig,
  LoadTestSummary,
  PerformanceMonitorStats,
  PerformanceThresholds,
  PerformanceValidationResult,
  TestEnvironment,
  TestPerformanceMonitor,
} from './integrationTestSetup/types'

export class IntegrationTestEnvironment {
  private config: IntegrationTestConfig
  private services: Map<string, unknown> = new Map()
  private mocks: Map<string, unknown> = new Map()
  private cleanup: Array<() => Promise<void>> = []
  private isSetup = false

  constructor(config: Partial<IntegrationTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async setup(): Promise<void> {
    if (this.isSetup) {
      return
    }

    console.log('🚀 Setting up integration test environment...')

    try {
      await setupMockServices(this.services)
      await setupTestData(this.services)
      await setupNetworkMocks(this.mocks, this.cleanup)
      await this.setupPerformanceMonitoring()

      this.isSetup = true
      console.log('✅ Integration test environment ready')
    } catch (error: unknown) {
      console.error('❌ Failed to setup integration test environment:', error)
      await this.teardown()
      throw error
    }
  }

  private async setupPerformanceMonitoring(): Promise<void> {
    console.log('📈 Setting up performance monitoring...')
    this.services.set('performance', createPerformanceMonitor())
    console.log('✅ Performance monitoring setup complete')
  }

  getService<T = unknown>(name: string): T | undefined {
    return this.services.get(name) as T | undefined
  }

  getMock<T = unknown>(name: string): T | undefined {
    return this.mocks.get(name) as T | undefined
  }

  getConfig(): IntegrationTestConfig {
    return this.config
  }

  async waitForServices(timeout = 30000): Promise<void> {
    await waitForServicesReady(this.services, timeout)
  }

  async runLoadTest(options: LoadTestOptions): Promise<LoadTestSummary> {
    return executeLoadTest(options)
  }

  validatePerformance(thresholds: PerformanceThresholds): PerformanceValidationResult {
    const performance = this.getService<TestPerformanceMonitor>('performance')
    return validatePerformanceMetrics(performance, thresholds)
  }

  async teardown(): Promise<void> {
    if (!this.isSetup) {
      return
    }

    console.log('🧹 Tearing down integration test environment...')

    for (const cleanupFn of this.cleanup) {
      try {
        await cleanupFn()
      } catch (error: unknown) {
        console.error('Cleanup error:', error)
      }
    }

    this.services.clear()
    this.mocks.clear()
    this.cleanup.length = 0
    this.isSetup = false

    console.log('✅ Integration test environment cleaned up')
  }
}

let globalTestEnv: IntegrationTestEnvironment | null = null

export function getIntegrationTestEnvironment(config?: Partial<IntegrationTestConfig>): IntegrationTestEnvironment {
  if (!globalTestEnv) {
    globalTestEnv = new IntegrationTestEnvironment(config)
  }
  return globalTestEnv
}

export async function setupIntegrationTests(
  config?: Partial<IntegrationTestConfig>
): Promise<IntegrationTestEnvironment> {
  const env = getIntegrationTestEnvironment(config)
  await env.setup()
  return env
}

export async function teardownIntegrationTests(): Promise<void> {
  if (globalTestEnv) {
    await globalTestEnv.teardown()
    globalTestEnv = null
  }
}
