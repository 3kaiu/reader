import type { IntegrationTestConfig } from './types'

export const DEFAULT_CONFIG: IntegrationTestConfig = {
  environment: 'development',
  services: {
    cloudflareWorkers: true,
    kvStorage: true,
    analytics: true,
    cdn: true,
    tunnel: true,
  },
  endpoints: {
    api: 'http://localhost:3000/api',
    cdn: 'http://localhost:3001',
    workers: 'http://localhost:8787',
    analytics: 'http://localhost:3000/analytics',
  },
  timeouts: {
    api: 5000,
    worker: 3000,
    sync: 10000,
  },
  limits: {
    maxConcurrentRequests: 50,
    maxTestDuration: 300000,
    maxMemoryUsage: 512 * 1024 * 1024,
  },
}
