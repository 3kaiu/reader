import { vi } from 'vitest'

export async function setupMockServices(services: Map<string, unknown>): Promise<void> {
  console.log('📦 Setting up mock services...')

  const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(() => ({ keys: [] })),
    getWithMetadata: vi.fn(),
  }
  services.set('kv', mockKV)

  const mockWorkers = {
    analytics: vi.fn(),
    sync: vi.fn(),
    health: vi.fn(),
    storage: vi.fn(),
  }
  services.set('workers', mockWorkers)

  const mockAnalytics = {
    track: vi.fn(),
    getMetrics: vi.fn(),
    getUsage: vi.fn(),
  }
  services.set('analytics', mockAnalytics)

  const mockCDN = {
    cache: vi.fn(),
    purge: vi.fn(),
    getStats: vi.fn(),
  }
  services.set('cdn', mockCDN)

  const mockHealth = {
    check: vi.fn(),
    getStatus: vi.fn(),
    getMetrics: vi.fn(),
  }
  services.set('health', mockHealth)

  console.log('✅ Mock services setup complete')
}
