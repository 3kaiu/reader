export const TEST_CONFIG = {
  TIMEOUT: 10000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MOCK_LATENCY: 50,
  PERFORMANCE_THRESHOLD: {
    responseTime: 1000,
    memoryUsage: 50 * 1024 * 1024,
    cpuUsage: 80,
  },
  LOAD_TEST: {
    concurrentUsers: 100,
    duration: 60000,
    rampUpTime: 10000,
  },
}
