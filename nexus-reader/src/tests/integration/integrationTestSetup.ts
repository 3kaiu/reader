/**
 * Integration Test Environment Setup
 * 
 * Provides comprehensive integration testing infrastructure for validating
 * all system components working together across the entire stack.
 */

import { vi } from 'vitest';

export interface IntegrationTestConfig {
  environment: 'development' | 'staging' | 'production';
  services: {
    cloudflareWorkers: boolean;
    kvStorage: boolean;
    analytics: boolean;
    ai: boolean;
    cdn: boolean;
    tunnel: boolean;
  };
  endpoints: {
    api: string;
    cdn: string;
    workers: string;
    analytics: string;
  };
  timeouts: {
    api: number;
    worker: number;
    sync: number;
    ai: number;
  };
  limits: {
    maxConcurrentRequests: number;
    maxTestDuration: number;
    maxMemoryUsage: number;
  };
}

export interface TestEnvironment {
  config: IntegrationTestConfig;
  services: Map<string, any>;
  mocks: Map<string, any>;
  cleanup: (() => Promise<void>)[];
}

const DEFAULT_CONFIG: IntegrationTestConfig = {
  environment: 'development',
  services: {
    cloudflareWorkers: true,
    kvStorage: true,
    analytics: true,
    ai: true,
    cdn: true,
    tunnel: true
  },
  endpoints: {
    api: 'http://localhost:3000/api',
    cdn: 'http://localhost:3001',
    workers: 'http://localhost:8787',
    analytics: 'http://localhost:3000/analytics'
  },
  timeouts: {
    api: 5000,
    worker: 3000,
    sync: 10000,
    ai: 15000
  },
  limits: {
    maxConcurrentRequests: 50,
    maxTestDuration: 300000, // 5 minutes
    maxMemoryUsage: 512 * 1024 * 1024 // 512MB
  }
};

export class IntegrationTestEnvironment {
  private config: IntegrationTestConfig;
  private services: Map<string, any> = new Map();
  private mocks: Map<string, any> = new Map();
  private cleanup: (() => Promise<void>)[] = [];
  private isSetup = false;

  constructor(config: Partial<IntegrationTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Setup the complete integration test environment
   */
  async setup(): Promise<void> {
    if (this.isSetup) {
      return;
    }

    console.log('🚀 Setting up integration test environment...');

    try {
      // Setup core services
      await this.setupMockServices();
      await this.setupTestData();
      await this.setupNetworkMocks();
      await this.setupPerformanceMonitoring();
      
      this.isSetup = true;
      console.log('✅ Integration test environment ready');

    } catch (error: any) {
      console.error('❌ Failed to setup integration test environment:', error);
      await this.teardown();
      throw error;
    }
  }

  /**
   * Setup mock services for all system components
   */
  private async setupMockServices(): Promise<void> {
    console.log('📦 Setting up mock services...');

    // Mock Cloudflare KV Storage
    const mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(() => ({ keys: [] })),
      getWithMetadata: vi.fn()
    };
    this.services.set('kv', mockKV);

    // Mock Cloudflare Workers
    const mockWorkers = {
      analytics: vi.fn(),
      ai: vi.fn(),
      sync: vi.fn(),
      health: vi.fn(),
      storage: vi.fn()
    };
    this.services.set('workers', mockWorkers);

    // Mock Analytics Service
    const mockAnalytics = {
      track: vi.fn(),
      getMetrics: vi.fn(),
      getUsage: vi.fn()
    };
    this.services.set('analytics', mockAnalytics);

    // Mock AI Services
    const mockAI = {
      recommend: vi.fn(),
      search: vi.fn(),
      classify: vi.fn()
    };
    this.services.set('ai', mockAI);

    // Mock CDN Service
    const mockCDN = {
      cache: vi.fn(),
      purge: vi.fn(),
      getStats: vi.fn()
    };
    this.services.set('cdn', mockCDN);

    // Mock Health Monitor
    const mockHealth = {
      check: vi.fn(),
      getStatus: vi.fn(),
      getMetrics: vi.fn()
    };
    this.services.set('health', mockHealth);

    console.log('✅ Mock services setup complete');
  }

  /**
   * Setup test data for integration tests
   */
  private async setupTestData(): Promise<void> {
    console.log('📊 Setting up test data...');

    // Sample user data
    const testUsers = [
      {
        id: 'user-1',
        preferences: { theme: 'dark', fontSize: 16 },
        progress: { 'novel-1': { chapter: 5, position: 0.3 } }
      },
      {
        id: 'user-2',
        preferences: { theme: 'light', fontSize: 14 },
        progress: { 'novel-2': { chapter: 2, position: 0.7 } }
      }
    ];

    // Sample novel data
    const testNovels = [
      {
        id: 'novel-1',
        title: 'Test Novel 1',
        author: 'Test Author 1',
        chapters: [
          { id: 'ch-1', title: 'Chapter 1', content: 'Test content 1' },
          { id: 'ch-2', title: 'Chapter 2', content: 'Test content 2' }
        ]
      },
      {
        id: 'novel-2',
        title: 'Test Novel 2',
        author: 'Test Author 2',
        chapters: [
          { id: 'ch-3', title: 'Chapter 1', content: 'Test content 3' },
          { id: 'ch-4', title: 'Chapter 2', content: 'Test content 4' }
        ]
      }
    ];

    // Store test data in mock services
    const mockKV = this.services.get('kv');
    for (const user of testUsers) {
      mockKV.get.mockImplementation((key: string) => {
        if (key === `user:${user.id}:preferences`) {
          return Promise.resolve(JSON.stringify(user.preferences));
        }
        if (key === `user:${user.id}:progress`) {
          return Promise.resolve(JSON.stringify(user.progress));
        }
        return Promise.resolve(null);
      });
    }

    for (const novel of testNovels) {
      mockKV.get.mockImplementation((key: string) => {
        if (key === `novel:${novel.id}`) {
          return Promise.resolve(JSON.stringify(novel));
        }
        return Promise.resolve(null);
      });
    }

    this.services.set('testUsers', testUsers);
    this.services.set('testNovels', testNovels);

    console.log('✅ Test data setup complete');
  }

  /**
   * Setup network mocks for external services
   */
  private async setupNetworkMocks(): Promise<void> {
    console.log('🌐 Setting up network mocks...');

    // Mock fetch for API calls
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    // Setup fetch responses for different endpoints
    mockFetch.mockImplementation((url: string, _options?: any) => {
      const urlStr = url.toString();

      // Analytics endpoint
      if (urlStr.includes('/analytics')) {
        return Promise.resolve(new Response(JSON.stringify({
          success: true,
          data: { events: [], metrics: {} }
        }), { status: 200 }));
      }

      // AI endpoints
      if (urlStr.includes('/ai/')) {
        return Promise.resolve(new Response(JSON.stringify({
          success: true,
          data: { recommendations: [], results: [] }
        }), { status: 200 }));
      }

      // Health endpoint
      if (urlStr.includes('/health')) {
        return Promise.resolve(new Response(JSON.stringify({
          status: 'healthy',
          services: { all: 'operational' }
        }), { status: 200 }));
      }

      // Storage endpoint
      if (urlStr.includes('/storage')) {
        return Promise.resolve(new Response(JSON.stringify({
          usage: { total: 1000, used: 100, available: 900 }
        }), { status: 200 }));
      }

      // Default response
      return Promise.resolve(new Response(JSON.stringify({
        error: 'Not mocked'
      }), { status: 404 }));
    });

    global.fetch = mockFetch;
    this.mocks.set('fetch', { original: originalFetch, mock: mockFetch });

    // Cleanup function to restore original fetch
    this.cleanup.push(async () => {
      // @ts-ignore
  globalThis.__originalConsole = originalConsole;
    });

    console.log('✅ Network mocks setup complete');
  }

  /**
   * Setup performance monitoring for tests
   */
  private async setupPerformanceMonitoring(): Promise<void> {
    console.log('📈 Setting up performance monitoring...');

    const performanceMonitor = {
      startTime: Date.now(),
      memoryUsage: new Map<string, number>(),
      requestCounts: new Map<string, number>(),
      responseTimes: new Map<string, number[]>(),

      recordRequest: (endpoint: string, responseTime: number) => {
        const times = performanceMonitor.responseTimes.get(endpoint) || [];
        times.push(responseTime);
        performanceMonitor.responseTimes.set(endpoint, times);

        const count = performanceMonitor.requestCounts.get(endpoint) || 0;
        performanceMonitor.requestCounts.set(endpoint, count + 1);
      },

      recordMemoryUsage: (component: string) => {
        if (typeof process !== 'undefined' && process.memoryUsage) {
          const usage = process.memoryUsage();
          performanceMonitor.memoryUsage.set(component, usage.heapUsed);
        }
      },

      getStats: () => ({
        duration: Date.now() - performanceMonitor.startTime,
        requests: Object.fromEntries(performanceMonitor.requestCounts),
        averageResponseTimes: Object.fromEntries(
          Array.from(performanceMonitor.responseTimes.entries()).map(([endpoint, times]) => [
            endpoint,
            times.reduce((a, b) => a + b, 0) / times.length
          ])
        ),
        memoryUsage: Object.fromEntries(performanceMonitor.memoryUsage)
      })
    };

    this.services.set('performance', performanceMonitor);

    console.log('✅ Performance monitoring setup complete');
  }

  /**
   * Get a mock service by name
   */
  getService<T = any>(name: string): T | undefined {
    return this.services.get(name);
  }

  /**
   * Get a mock by name
   */
  getMock<T = any>(name: string): T | undefined {
    return this.mocks.get(name);
  }

  /**
   * Get the test configuration
   */
  getConfig(): IntegrationTestConfig {
    return this.config;
  }

  /**
   * Wait for all services to be ready
   */
  async waitForServices(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const allReady = Array.from(this.services.keys()).every(service => {
        const svc = this.services.get(service);
        return svc && (typeof svc.ready !== 'function' || svc.ready());
      });

      if (allReady) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Services did not become ready within timeout');
  }

  /**
   * Run a load test with specified parameters
   */
  async runLoadTest(options: {
    endpoint: string;
    concurrency: number;
    duration: number;
    requestsPerSecond?: number;
  }): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    requestsPerSecond: number;
  }> {
    const { endpoint, concurrency, duration, requestsPerSecond = 10 } = options;
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [] as number[]
    };

    const workers = [];
    
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.loadTestWorker(endpoint, endTime, requestsPerSecond, results));
    }

    await Promise.all(workers);

    const responseTimes = results.responseTimes;
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;

    return {
      totalRequests: results.totalRequests,
      successfulRequests: results.successfulRequests,
      failedRequests: results.failedRequests,
      averageResponseTime: avgResponseTime,
      maxResponseTime: Math.max(...responseTimes, 0),
      minResponseTime: Math.min(...responseTimes, 0),
      requestsPerSecond: results.totalRequests / (duration / 1000)
    };
  }

  /**
   * Load test worker function
   */
  private async loadTestWorker(
    endpoint: string,
    endTime: number,
    requestsPerSecond: number,
    results: any
  ): Promise<void> {
    const interval = 1000 / requestsPerSecond;
    
    while (Date.now() < endTime) {
      const requestStart = Date.now();
      
      try {
        const response = await fetch(endpoint);
        const responseTime = Date.now() - requestStart;
        
        results.totalRequests++;
        results.responseTimes.push(responseTime);
        
        if (response.ok) {
          results.successfulRequests++;
        } else {
          results.failedRequests++;
        }
        
      } catch (error: any) {
        results.totalRequests++;
        results.failedRequests++;
        results.responseTimes.push(Date.now() - requestStart);
      }
      
      // Wait for next request
      const elapsed = Date.now() - requestStart;
      const waitTime = Math.max(0, interval - elapsed);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Validate system performance against thresholds
   */
  validatePerformance(thresholds: {
    maxResponseTime?: number;
    minSuccessRate?: number;
    maxMemoryUsage?: number;
    maxErrorRate?: number;
  }): {
    passed: boolean;
    violations: string[];
    metrics: any;
  } {
    const performance = this.services.get('performance');
    const stats = performance?.getStats() || {};
    
    const violations: string[] = [];
    
    // Check response times
    if (thresholds.maxResponseTime) {
      const avgTimes = stats.averageResponseTimes || {};
      Object.entries(avgTimes).forEach(([endpoint, avgTime]) => {
        if ((avgTime as number) > thresholds.maxResponseTime!) {
          violations.push(`${endpoint} average response time ${avgTime}ms exceeds ${thresholds.maxResponseTime}ms`);
        }
      });
    }
    
    // Check memory usage
    if (thresholds.maxMemoryUsage) {
      const memUsage = stats.memoryUsage || {};
      Object.entries(memUsage).forEach(([component, usage]) => {
        if ((usage as number) > thresholds.maxMemoryUsage!) {
          violations.push(`${component} memory usage ${usage} bytes exceeds ${thresholds.maxMemoryUsage} bytes`);
        }
      });
    }
    
    return {
      passed: violations.length === 0,
      violations,
      metrics: stats
    };
  }

  /**
   * Teardown the integration test environment
   */
  async teardown(): Promise<void> {
    if (!this.isSetup) {
      return;
    }

    console.log('🧹 Tearing down integration test environment...');

    // Run all cleanup functions
    for (const cleanupFn of this.cleanup) {
      try {
        await cleanupFn();
      } catch (error: any) {
        console.error('Cleanup error:', error);
      }
    }

    // Clear all services and mocks
    this.services.clear();
    this.mocks.clear();
    this.cleanup.length = 0;
    this.isSetup = false;

    console.log('✅ Integration test environment cleaned up');
  }
}

// Global test environment instance
let globalTestEnv: IntegrationTestEnvironment | null = null;

/**
 * Get or create the global integration test environment
 */
export function getIntegrationTestEnvironment(config?: Partial<IntegrationTestConfig>): IntegrationTestEnvironment {
  if (!globalTestEnv) {
    globalTestEnv = new IntegrationTestEnvironment(config);
  }
  return globalTestEnv;
}

/**
 * Setup integration test environment for a test suite
 */
export async function setupIntegrationTests(config?: Partial<IntegrationTestConfig>): Promise<IntegrationTestEnvironment> {
  const env = getIntegrationTestEnvironment(config);
  await env.setup();
  return env;
}

/**
 * Teardown integration test environment
 */
export async function teardownIntegrationTests(): Promise<void> {
  if (globalTestEnv) {
    await globalTestEnv.teardown();
    // @ts-ignore
  if (globalThis.__originalConsole) {
    // @ts-ignore
    Object.assign(console, globalThis.__originalConsole);
  }
  globalTestEnv = null;
  }
}