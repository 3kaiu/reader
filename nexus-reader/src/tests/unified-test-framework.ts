export { TEST_CONFIG } from './unified-test-framework/config'
export { createTestData } from './unified-test-framework/helpers'
export { IntegrationTestFramework, integrationTester } from './unified-test-framework/integration'
export { setupTestLifecycle } from './unified-test-framework/lifecycle'
export {
  MockFactory,
  globalMockFactory,
  resetAllMocks,
  setupApiMocks,
} from './unified-test-framework/mockFactory'
export { PerformanceTestFramework } from './unified-test-framework/performance'
export { PropertyTestFramework } from './unified-test-framework/property'

export type {
  BenchmarkOptions,
  E2EScenario,
  IntegrationScenario,
  LoadTestOptions,
  LoadTestResult,
  MockApi,
  MockMethod,
  MockMethods,
  PerformanceMetrics,
} from './unified-test-framework/types'
