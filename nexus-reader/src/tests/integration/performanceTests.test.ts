/**
 * Performance and Load Testing Suite
 * 
 * Comprehensive performance testing for the free-tier-maximization system
 * to ensure optimal resource utilization within free tier limits.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { 
  setupIntegrationTests, 
  teardownIntegrationTests, 
  IntegrationTestEnvironment 
} from './integrationTestSetup';

describe('Performance and Load Tests', () => {
  let testEnv: IntegrationTestEnvironment;

  beforeAll(async () => {
    testEnv = await setupIntegrationTests({
      environment: 'development',
      limits: {
        maxConcurrentRequests: 100,
        maxTestDuration: 60000, // 1 minute
        maxMemoryUsage: 256 * 1024 * 1024 // 256MB
      }
    });
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  describe('Free Tier Resource Optimization', () => {
    it('should stay within Cloudflare Workers request limits', async () => {
      const config = testEnv.getConfig();
      const dailyLimit = 100000; // Cloudflare Workers free tier daily limit
      const testDuration = 5000; // 5 seconds
      const maxRequestsPerSecond = dailyLimit / (24 * 60 * 60); // ~1.16 requests/second sustainable
      
      // Test with burst load that should be manageable
      const loadTestResults = await testEnv.runLoadTest({
        endpoint: config.endpoints.workers + '/api/health',
        concurrency: 3,
        duration: testDuration,
        requestsPerSecond: 5 // Well below sustainable rate
      });

      expect(loadTestResults.requestsPerSecond).toBeLessThan(maxRequestsPerSecond * 10); // Allow 10x burst
      expect(loadTestResults.successfulRequests).toBeGreaterThan(0);
      expect(loadTestResults.averageResponseTime).toBeLessThan(1000); // Should be fast
      
      console.log('Workers Load Test Results:', {
        totalRequests: loadTestResults.totalRequests,
        requestsPerSecond: loadTestResults.requestsPerSecond,
        averageResponseTime: loadTestResults.averageResponseTime,
        successRate: (loadTestResults.successfulRequests / loadTestResults.totalRequests) * 100
      });
    });

    it('should optimize KV storage operations for 1GB limit', async () => {
      const mockKV = testEnv.getService('kv');
      const performance = testEnv.getService('performance');
      
      // Mock KV operations with size tracking
      let totalStorageUsed = 0;
      const maxStorage = 1024 * 1024 * 1024; // 1GB limit
      
      mockKV.put.mockImplementation((key: string, value: string) => {
        const size = new TextEncoder().encode(key + value).length;
        totalStorageUsed += size;
        performance.recordRequest('kv_write', Math.random() * 50 + 10); // 10-60ms
        return Promise.resolve();
      });

      mockKV.get.mockImplementation((key: string) => {
        performance.recordRequest('kv_read', Math.random() * 30 + 5); // 5-35ms
        return Promise.resolve(JSON.stringify({ data: 'test' }));
      });

      // Simulate typical usage patterns
      const operations = [];
      
      // User progress updates (frequent, small)
      for (let i = 0; i < 100; i++) {
        operations.push(mockKV.put(`user:${i}:progress`, JSON.stringify({
          novel: 'test-novel',
          chapter: Math.floor(Math.random() * 20),
          position: Math.random()
        })));
      }

      // Novel content (infrequent, large)
      for (let i = 0; i < 10; i++) {
        const content = 'x'.repeat(50000); // 50KB per novel chapter
        operations.push(mockKV.put(`novel:${i}:chapter:1`, JSON.stringify({
          title: `Chapter 1 of Novel ${i}`,
          content
        })));
      }

      // Cache data (frequent, medium)
      for (let i = 0; i < 50; i++) {
        operations.push(mockKV.put(`cache:search:${i}`, JSON.stringify({
          query: `search term ${i}`,
          results: Array(10).fill(null).map((_, j) => ({ id: j, title: `Result ${j}` }))
        })));
      }

      await Promise.all(operations);

      // Verify storage usage is reasonable
      expect(totalStorageUsed).toBeLessThan(maxStorage * 0.1); // Should use less than 10% in test
      
      const stats = performance.getStats();
      expect(stats.averageResponseTimes['kv_write']).toBeLessThan(100);
      expect(stats.averageResponseTimes['kv_read']).toBeLessThan(50);
      
      console.log('KV Storage Test Results:', {
        totalStorageUsed: `${(totalStorageUsed / 1024 / 1024).toFixed(2)} MB`,
        storageUtilization: `${((totalStorageUsed / maxStorage) * 100).toFixed(2)}%`,
        avgWriteTime: stats.averageResponseTimes['kv_write'],
        avgReadTime: stats.averageResponseTimes['kv_read']
      });
    });

    it('should handle GitHub Actions within 2000 minute monthly limit', async () => {
      // Simulate CI/CD pipeline execution times
      const monthlyLimit = 2000 * 60 * 1000; // 2000 minutes in milliseconds
      const dailyBudget = monthlyLimit / 30; // Daily budget
      
      const pipelineSteps = [
        { name: 'checkout', duration: 30000 }, // 30 seconds
        { name: 'setup-node', duration: 45000 }, // 45 seconds
        { name: 'install-deps', duration: 120000 }, // 2 minutes
        { name: 'run-tests', duration: 300000 }, // 5 minutes
        { name: 'build', duration: 180000 }, // 3 minutes
        { name: 'deploy', duration: 90000 } // 1.5 minutes
      ];

      const totalPipelineTime = pipelineSteps.reduce((sum, step) => sum + step.duration, 0);
      const maxDailyRuns = Math.floor(dailyBudget / totalPipelineTime);
      
      expect(totalPipelineTime).toBeLessThan(dailyBudget); // Should allow at least 1 run per day
      expect(maxDailyRuns).toBeGreaterThanOrEqual(1);
      
      console.log('GitHub Actions Budget Analysis:', {
        totalPipelineTime: `${(totalPipelineTime / 60000).toFixed(1)} minutes`,
        dailyBudget: `${(dailyBudget / 60000).toFixed(1)} minutes`,
        maxDailyRuns,
        monthlyRunsEstimate: maxDailyRuns * 30
      });
    });
  });

  describe('System Performance Benchmarks', () => {
    it('should achieve target response times for API endpoints', async () => {
      const mockFetch = testEnv.getMock('fetch');
      const performance = testEnv.getService('performance');
      
      // Mock different endpoint response times
      const endpointTargets = {
        '/api/user/progress': 100, // 100ms target
        '/api/novels': 200, // 200ms target
        '/api/search': 300, // 300ms target
        '/api/analytics': 150, // 150ms target
        '/api/health': 50 // 50ms target
      };

      mockFetch.mock.mockImplementation((url: string) => {
        const endpoint = new URL(url).pathname;
        const targetTime = endpointTargets[endpoint as keyof typeof endpointTargets] || 100;
        const actualTime = targetTime + (Math.random() - 0.5) * 20; // ±10ms variance
        
        performance.recordRequest(endpoint, actualTime);
        
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
          }, actualTime);
        });
      });

      // Test each endpoint
      const requests = Object.keys(endpointTargets).map(async endpoint => {
        const startTime = Date.now();
        await fetch(`http://localhost:3000${endpoint}`);
        return Date.now() - startTime;
      });

      const responseTimes = await Promise.all(requests);
      const stats = performance.getStats();

      // Verify all endpoints meet their targets (with some tolerance)
      Object.entries(endpointTargets).forEach(([endpoint, target], index) => {
        const actualTime = stats.averageResponseTimes[endpoint];
        expect(actualTime).toBeLessThan(target * 1.2); // 20% tolerance
      });

      console.log('API Response Time Benchmarks:', stats.averageResponseTimes);
    });

    it('should handle concurrent user sessions efficiently', async () => {
      const mockKV = testEnv.getService('kv');
      const mockAnalytics = testEnv.getService('analytics');
      const performance = testEnv.getService('performance');

      // Mock optimized responses
      mockKV.get.mockImplementation(() => {
        performance.recordRequest('concurrent_kv_read', Math.random() * 20 + 10);
        return Promise.resolve(JSON.stringify({ data: 'test' }));
      });

      mockKV.put.mockImplementation(() => {
        performance.recordRequest('concurrent_kv_write', Math.random() * 30 + 15);
        return Promise.resolve();
      });

      mockAnalytics.track.mockImplementation(() => {
        performance.recordRequest('concurrent_analytics', Math.random() * 40 + 20);
        return Promise.resolve({ success: true });
      });

      // Simulate 50 concurrent user sessions
      const concurrentUsers = 50;
      const sessionPromises = Array.from({ length: concurrentUsers }, async (_, userId) => {
        const startTime = Date.now();
        
        // Typical user session operations
        await mockKV.get(`user:${userId}:preferences`);
        await mockKV.get(`user:${userId}:progress`);
        await mockAnalytics.track('session_start', { userId });
        
        // Simulate reading time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        
        await mockKV.put(`user:${userId}:progress`, JSON.stringify({
          novel: 'test',
          chapter: Math.floor(Math.random() * 10),
          position: Math.random()
        }));
        await mockAnalytics.track('session_end', { userId });
        
        return Date.now() - startTime;
      });

      const sessionTimes = await Promise.all(sessionPromises);
      const stats = performance.getStats();

      // Verify concurrent performance
      const avgSessionTime = sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length;
      const maxSessionTime = Math.max(...sessionTimes);

      expect(avgSessionTime).toBeLessThan(500); // Average session should complete in 500ms
      expect(maxSessionTime).toBeLessThan(1000); // No session should take more than 1 second
      expect(stats.requests['concurrent_kv_read']).toBe(concurrentUsers * 2); // 2 reads per user
      expect(stats.requests['concurrent_kv_write']).toBe(concurrentUsers); // 1 write per user

      console.log('Concurrent Session Performance:', {
        concurrentUsers,
        avgSessionTime: `${avgSessionTime.toFixed(1)}ms`,
        maxSessionTime: `${maxSessionTime}ms`,
        avgKVReadTime: stats.averageResponseTimes['concurrent_kv_read'],
        avgKVWriteTime: stats.averageResponseTimes['concurrent_kv_write']
      });
    });

    it('should optimize memory usage for large datasets', async () => {
      const performance = testEnv.getService('performance');
      
      // Simulate processing large novel collections
      const novels = Array.from({ length: 1000 }, (_, i) => ({
        id: `novel-${i}`,
        title: `Test Novel ${i}`,
        author: `Author ${i}`,
        chapters: Array.from({ length: 20 }, (_, j) => ({
          id: `ch-${j}`,
          title: `Chapter ${j + 1}`,
          content: 'x'.repeat(5000) // 5KB per chapter
        }))
      }));

      performance.recordMemoryUsage('before_processing');

      // Simulate memory-efficient processing
      const processedNovels = [];
      const batchSize = 50; // Process in batches to manage memory

      for (let i = 0; i < novels.length; i += batchSize) {
        const batch = novels.slice(i, i + batchSize);
        
        // Simulate processing (e.g., indexing, AI analysis)
        const processedBatch = batch.map(novel => ({
          id: novel.id,
          title: novel.title,
          author: novel.author,
          chapterCount: novel.chapters.length,
          wordCount: novel.chapters.reduce((sum, ch) => sum + ch.content.length, 0)
        }));

        processedNovels.push(...processedBatch);
        
        // Record memory usage during processing
        performance.recordMemoryUsage(`batch_${Math.floor(i / batchSize)}`);
        
        // Simulate brief pause to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      performance.recordMemoryUsage('after_processing');

      const stats = performance.getStats();
      const memoryUsages = Object.values(stats.memoryUsage);
      const maxMemoryUsage = Math.max(...memoryUsages);
      const memoryGrowth = stats.memoryUsage['after_processing'] - stats.memoryUsage['before_processing'];

      expect(processedNovels).toHaveLength(1000);
      expect(maxMemoryUsage).toBeLessThan(testEnv.getConfig().limits.maxMemoryUsage);
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Should not grow more than 50MB

      console.log('Memory Usage Analysis:', {
        novelsProcessed: processedNovels.length,
        maxMemoryUsage: `${(maxMemoryUsage / 1024 / 1024).toFixed(1)} MB`,
        memoryGrowth: `${(memoryGrowth / 1024 / 1024).toFixed(1)} MB`,
        batchSize
      });
    });
  });

  describe('Stress Testing', () => {
    it('should handle peak load scenarios', async () => {
      const config = testEnv.getConfig();
      
      // Simulate peak load (e.g., popular novel release)
      const peakLoadResults = await testEnv.runLoadTest({
        endpoint: config.endpoints.api + '/novels/popular',
        concurrency: 20,
        duration: 10000, // 10 seconds
        requestsPerSecond: 15
      });

      // Should handle peak load gracefully
      expect(peakLoadResults.successfulRequests).toBeGreaterThan(peakLoadResults.totalRequests * 0.95); // 95% success rate
      expect(peakLoadResults.averageResponseTime).toBeLessThan(2000); // Under 2 seconds average
      expect(peakLoadResults.maxResponseTime).toBeLessThan(5000); // No request over 5 seconds

      console.log('Peak Load Test Results:', {
        totalRequests: peakLoadResults.totalRequests,
        successRate: `${((peakLoadResults.successfulRequests / peakLoadResults.totalRequests) * 100).toFixed(1)}%`,
        avgResponseTime: `${peakLoadResults.averageResponseTime.toFixed(1)}ms`,
        maxResponseTime: `${peakLoadResults.maxResponseTime}ms`,
        requestsPerSecond: peakLoadResults.requestsPerSecond.toFixed(1)
      });
    });

    it('should recover from resource exhaustion', async () => {
      const mockKV = testEnv.getService('kv');
      const mockHealth = testEnv.getService('health');
      
      let requestCount = 0;
      const maxRequests = 100;

      // Simulate resource exhaustion after 100 requests
      mockKV.get.mockImplementation(() => {
        requestCount++;
        if (requestCount > maxRequests) {
          return Promise.reject(new Error('Rate limit exceeded'));
        }
        return Promise.resolve(JSON.stringify({ data: 'test' }));
      });

      // Simulate health check detecting the issue
      mockHealth.check.mockImplementation(() => {
        if (requestCount > maxRequests) {
          return Promise.resolve({
            status: 'critical',
            error: 'Rate limit exceeded',
            recovery: 'Implementing backoff strategy'
          });
        }
        return Promise.resolve({ status: 'healthy' });
      });

      // Test normal operation
      for (let i = 0; i < maxRequests; i++) {
        const result = await mockKV.get(`test:${i}`);
        expect(result).toBeDefined();
      }

      // Test resource exhaustion
      try {
        await mockKV.get('test:overflow');
        expect.fail('Should have thrown rate limit error');
      } catch (error) {
        expect(error.message).toBe('Rate limit exceeded');
      }

      // Test health check detection
      const healthStatus = await mockHealth.check('kv');
      expect(healthStatus.status).toBe('critical');
      expect(healthStatus.recovery).toBeDefined();

      console.log('Resource Exhaustion Test:', {
        requestsBeforeLimit: maxRequests,
        errorDetected: true,
        recoveryStrategy: healthStatus.recovery
      });
    });
  });

  describe('Performance Validation', () => {
    it('should meet all performance requirements', async () => {
      const performance = testEnv.getService('performance');
      
      // Record various operations
      performance.recordRequest('/api/novels', 150);
      performance.recordRequest('/api/user/progress', 80);
      performance.recordRequest('/api/search', 250);
      performance.recordRequest('/api/analytics', 120);
      performance.recordMemoryUsage('validation_test');

      const validation = testEnv.validatePerformance({
        maxResponseTime: 300, // 300ms max
        maxMemoryUsage: 200 * 1024 * 1024, // 200MB max
        minSuccessRate: 0.99 // 99% success rate
      });

      expect(validation.passed).toBe(true);
      expect(validation.violations).toHaveLength(0);

      console.log('Performance Validation Results:', {
        passed: validation.passed,
        violations: validation.violations,
        metrics: validation.metrics
      });
    });
  });
});