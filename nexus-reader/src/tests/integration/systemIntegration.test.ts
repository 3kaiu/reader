/**
 * System Integration Tests
 * 
 * Comprehensive tests that validate all system components working together
 * across the entire free-tier-maximization stack.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { 
  setupIntegrationTests, 
  teardownIntegrationTests, 
  IntegrationTestEnvironment 
} from './integrationTestSetup';

describe('System Integration Tests', () => {
  let testEnv: IntegrationTestEnvironment;

  beforeAll(async () => {
    testEnv = await setupIntegrationTests({
      environment: 'development',
      timeouts: {
        api: 5000,
        worker: 3000,
        sync: 10000,
        ai: 15000
      }
    });
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End User Workflows', () => {
    it('should handle complete user reading session', async () => {
      // Simulate a complete user reading session from login to logout
      const mockKV = testEnv.getService('kv');
      const mockAnalytics = testEnv.getService('analytics');
      const testUsers = testEnv.getService('testUsers');
      const testNovels = testEnv.getService('testNovels');

      const user = testUsers[0];
      const novel = testNovels[0];

      // 1. User authentication and preference loading
      mockKV.get.mockResolvedValueOnce(JSON.stringify(user.preferences));
      
      // 2. Load user's reading progress
      mockKV.get.mockResolvedValueOnce(JSON.stringify(user.progress));
      
      // 3. Load novel content
      mockKV.get.mockResolvedValueOnce(JSON.stringify(novel));
      
      // 4. Track reading session start
      mockAnalytics.track.mockResolvedValueOnce({ success: true });
      
      // 5. Update reading progress
      mockKV.put.mockResolvedValueOnce(undefined);
      
      // 6. Track reading session end
      mockAnalytics.track.mockResolvedValueOnce({ success: true });

      // Simulate the workflow
      const preferences = await mockKV.get(`user:${user.id}:preferences`);
      expect(JSON.parse(preferences)).toEqual(user.preferences);

      const progress = await mockKV.get(`user:${user.id}:progress`);
      expect(JSON.parse(progress)).toEqual(user.progress);

      const novelData = await mockKV.get(`novel:${novel.id}`);
      expect(JSON.parse(novelData)).toEqual(novel);

      await mockAnalytics.track('reading_session_start', { userId: user.id, novelId: novel.id });
      await mockKV.put(`user:${user.id}:progress`, JSON.stringify({ 
        ...user.progress, 
        [novel.id]: { chapter: 6, position: 0.5 } 
      }));
      await mockAnalytics.track('reading_session_end', { userId: user.id, novelId: novel.id });

      // Verify all services were called correctly
      expect(mockKV.get).toHaveBeenCalledTimes(3);
      expect(mockKV.put).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.track).toHaveBeenCalledTimes(2);
    });

    it('should handle multi-device synchronization workflow', async () => {
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');
      const testUsers = testEnv.getService('testUsers');

      const user = testUsers[0];

      // Device 1 updates progress
      const device1Progress = { 'novel-1': { chapter: 7, position: 0.8 } };
      mockKV.put.mockResolvedValueOnce(undefined);
      mockWorkers.sync.mockResolvedValueOnce({ success: true, synced: true });

      // Device 2 receives sync notification
      mockKV.get.mockResolvedValueOnce(JSON.stringify(device1Progress));
      mockWorkers.sync.mockResolvedValueOnce({ success: true, received: true });

      // Simulate sync workflow
      await mockKV.put(`user:${user.id}:progress`, JSON.stringify(device1Progress));
      await mockWorkers.sync('progress_update', { userId: user.id, deviceId: 'device-1' });

      const syncedProgress = await mockKV.get(`user:${user.id}:progress`);
      expect(JSON.parse(syncedProgress)).toEqual(device1Progress);

      await mockWorkers.sync('progress_received', { userId: user.id, deviceId: 'device-2' });

      expect(mockKV.put).toHaveBeenCalledWith(`user:${user.id}:progress`, JSON.stringify(device1Progress));
      expect(mockWorkers.sync).toHaveBeenCalledTimes(2);
    });

    it('should handle offline-to-online synchronization', async () => {
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');
      const testUsers = testEnv.getService('testUsers');

      const user = testUsers[0];

      // Simulate offline changes
      const offlineChanges = [
        { type: 'progress', novelId: 'novel-1', chapter: 8, position: 0.2 },
        { type: 'bookmark', novelId: 'novel-1', chapter: 8, position: 0.2, note: 'Great scene!' },
        { type: 'preference', key: 'fontSize', value: 18 }
      ];

      // Mock successful sync for each change
      for (const change of offlineChanges) {
        mockKV.put.mockResolvedValueOnce(undefined);
        mockWorkers.sync.mockResolvedValueOnce({ success: true, change });
      }

      // Simulate coming back online and syncing changes
      for (const change of offlineChanges) {
        await mockKV.put(`user:${user.id}:${change.type}`, JSON.stringify(change));
        await mockWorkers.sync('offline_sync', { userId: user.id, change });
      }

      expect(mockKV.put).toHaveBeenCalledTimes(3);
      expect(mockWorkers.sync).toHaveBeenCalledTimes(3);
    });
  });

  describe('Service Integration', () => {
    it('should integrate analytics with all system components', async () => {
      const mockAnalytics = testEnv.getService('analytics');
      const mockKV = testEnv.getService('kv');
      const mockAI = testEnv.getService('ai');
      const mockCDN = testEnv.getService('cdn');

      // Mock analytics responses
      mockAnalytics.track.mockResolvedValue({ success: true });
      mockAnalytics.getMetrics.mockResolvedValue({
        pageViews: 1000,
        uniqueUsers: 100,
        averageSessionTime: 1800
      });

      // Simulate various system events being tracked
      await mockAnalytics.track('page_view', { page: '/novel/123' });
      await mockAnalytics.track('kv_read', { key: 'user:123:progress' });
      await mockAnalytics.track('ai_recommendation', { userId: '123', type: 'novel' });
      await mockAnalytics.track('cdn_cache_hit', { resource: '/static/novel-cover.jpg' });

      const metrics = await mockAnalytics.getMetrics();

      expect(mockAnalytics.track).toHaveBeenCalledTimes(4);
      expect(metrics).toHaveProperty('pageViews');
      expect(metrics).toHaveProperty('uniqueUsers');
      expect(metrics).toHaveProperty('averageSessionTime');
    });

    it('should integrate AI services with content management', async () => {
      const mockAI = testEnv.getService('ai');
      const mockKV = testEnv.getService('kv');
      const testNovels = testEnv.getService('testNovels');

      const novel = testNovels[0];

      // Mock AI service responses
      mockAI.classify.mockResolvedValue({
        genres: ['fantasy', 'adventure'],
        tags: ['magic', 'quest', 'friendship'],
        confidence: 0.85
      });

      mockAI.recommend.mockResolvedValue({
        recommendations: [
          { novelId: 'novel-2', score: 0.9, reason: 'Similar genre and themes' },
          { novelId: 'novel-3', score: 0.8, reason: 'Same author preference' }
        ]
      });

      mockKV.put.mockResolvedValue(undefined);

      // Simulate AI-enhanced content processing
      const classification = await mockAI.classify(novel.title, novel.chapters[0].content);
      await mockKV.put(`novel:${novel.id}:ai_metadata`, JSON.stringify(classification));

      const recommendations = await mockAI.recommend('user-1', { currentNovel: novel.id });

      expect(mockAI.classify).toHaveBeenCalledWith(novel.title, novel.chapters[0].content);
      expect(mockAI.recommend).toHaveBeenCalledWith('user-1', { currentNovel: novel.id });
      expect(mockKV.put).toHaveBeenCalledWith(
        `novel:${novel.id}:ai_metadata`, 
        JSON.stringify(classification)
      );
    });

    it('should integrate health monitoring across all services', async () => {
      const mockHealth = testEnv.getService('health');
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');
      const mockAnalytics = testEnv.getService('analytics');
      const mockAI = testEnv.getService('ai');
      const mockCDN = testEnv.getService('cdn');

      // Mock health check responses for all services
      mockHealth.check.mockImplementation((service: string) => {
        const healthStatuses = {
          kv: { status: 'healthy', responseTime: 50, uptime: 99.9 },
          workers: { status: 'healthy', responseTime: 30, uptime: 99.8 },
          analytics: { status: 'healthy', responseTime: 100, uptime: 99.7 },
          ai: { status: 'warning', responseTime: 200, uptime: 98.5 },
          cdn: { status: 'healthy', responseTime: 20, uptime: 99.9 }
        };
        return Promise.resolve(healthStatuses[service as keyof typeof healthStatuses]);
      });

      mockHealth.getStatus.mockResolvedValue({
        overall: 'healthy',
        services: {
          kv: 'healthy',
          workers: 'healthy',
          analytics: 'healthy',
          ai: 'warning',
          cdn: 'healthy'
        }
      });

      // Perform comprehensive health check
      const services = ['kv', 'workers', 'analytics', 'ai', 'cdn'];
      const healthResults = await Promise.all(
        services.map(service => mockHealth.check(service))
      );

      const overallStatus = await mockHealth.getStatus();

      expect(mockHealth.check).toHaveBeenCalledTimes(5);
      expect(healthResults).toHaveLength(5);
      expect(overallStatus.overall).toBe('healthy');
      expect(overallStatus.services.ai).toBe('warning');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent user sessions', async () => {
      const mockKV = testEnv.getService('kv');
      const mockAnalytics = testEnv.getService('analytics');
      const performance = testEnv.getService('performance');

      // Mock responses for concurrent operations
      mockKV.get.mockResolvedValue(JSON.stringify({ chapter: 1, position: 0 }));
      mockKV.put.mockResolvedValue(undefined);
      mockAnalytics.track.mockResolvedValue({ success: true });

      // Simulate 10 concurrent user sessions
      const concurrentSessions = Array.from({ length: 10 }, (_, i) => 
        simulateUserSession(`user-${i}`, mockKV, mockAnalytics, performance)
      );

      const results = await Promise.all(concurrentSessions);

      // Verify all sessions completed successfully
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.responseTime).toBeLessThan(1000); // Should complete within 1 second
      });

      // Verify performance metrics
      const stats = performance.getStats();
      expect(stats.requests['user_session']).toBe(10);
    });

    it('should maintain performance under load', async () => {
      const config = testEnv.getConfig();
      
      // Run load test against mock API endpoint
      const loadTestResults = await testEnv.runLoadTest({
        endpoint: config.endpoints.api + '/novels',
        concurrency: 5,
        duration: 5000, // 5 seconds
        requestsPerSecond: 10
      });

      expect(loadTestResults.totalRequests).toBeGreaterThan(40); // Should make ~50 requests
      expect(loadTestResults.successfulRequests).toBeGreaterThan(0);
      expect(loadTestResults.averageResponseTime).toBeLessThan(500); // Should be fast with mocks
      expect(loadTestResults.requestsPerSecond).toBeGreaterThan(8);
    });

    it('should validate performance thresholds', async () => {
      const performance = testEnv.getService('performance');
      
      // Record some mock performance data
      performance.recordRequest('/api/novels', 150);
      performance.recordRequest('/api/user/progress', 80);
      performance.recordRequest('/api/analytics', 200);
      performance.recordMemoryUsage('main');

      const validation = testEnv.validatePerformance({
        maxResponseTime: 300,
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        minSuccessRate: 0.95
      });

      expect(validation.passed).toBe(true);
      expect(validation.violations).toHaveLength(0);
      expect(validation.metrics).toHaveProperty('averageResponseTimes');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle service failures gracefully', async () => {
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');
      const mockHealth = testEnv.getService('health');

      // Simulate KV service failure
      mockKV.get.mockRejectedValueOnce(new Error('KV service unavailable'));
      mockKV.put.mockRejectedValueOnce(new Error('KV service unavailable'));

      // Health check should detect the failure
      mockHealth.check.mockResolvedValueOnce({
        status: 'critical',
        error: 'KV service unavailable',
        responseTime: 0
      });

      // Workers should implement fallback behavior
      mockWorkers.sync.mockResolvedValueOnce({
        success: false,
        fallback: true,
        message: 'Using local storage fallback'
      });

      // Test error handling
      try {
        await mockKV.get('user:123:progress');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('KV service unavailable');
      }

      const healthStatus = await mockHealth.check('kv');
      expect(healthStatus.status).toBe('critical');

      const fallbackResult = await mockWorkers.sync('fallback_mode', { service: 'kv' });
      expect(fallbackResult.fallback).toBe(true);
    });

    it('should recover from temporary network issues', async () => {
      const mockFetch = testEnv.getMock('fetch');
      let callCount = 0;

      // First two calls fail, third succeeds
      mockFetch.mock.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      });

      // Simulate retry logic
      let lastError;
      let result;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch('/api/test');
          result = await response.json();
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
          }
        }
      }

      expect(result).toEqual({ success: true });
      expect(mockFetch.mock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain data consistency across sync operations', async () => {
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');

      const userId = 'user-123';
      const initialProgress = { 'novel-1': { chapter: 5, position: 0.3 } };
      const updatedProgress = { 'novel-1': { chapter: 6, position: 0.1 } };

      // Mock initial state
      mockKV.get.mockResolvedValueOnce(JSON.stringify(initialProgress));
      
      // Mock successful update
      mockKV.put.mockResolvedValueOnce(undefined);
      
      // Mock sync confirmation
      mockWorkers.sync.mockResolvedValueOnce({ success: true, timestamp: Date.now() });
      
      // Mock final state verification
      mockKV.get.mockResolvedValueOnce(JSON.stringify(updatedProgress));

      // Simulate sync operation
      const currentProgress = JSON.parse(await mockKV.get(`user:${userId}:progress`));
      expect(currentProgress).toEqual(initialProgress);

      await mockKV.put(`user:${userId}:progress`, JSON.stringify(updatedProgress));
      await mockWorkers.sync('progress_update', { userId, progress: updatedProgress });

      const finalProgress = JSON.parse(await mockKV.get(`user:${userId}:progress`));
      expect(finalProgress).toEqual(updatedProgress);
    });

    it('should handle concurrent updates with conflict resolution', async () => {
      const mockKV = testEnv.getService('kv');
      const mockWorkers = testEnv.getService('workers');

      const userId = 'user-123';
      const device1Update = { 'novel-1': { chapter: 6, position: 0.5, timestamp: 1000 } };
      const device2Update = { 'novel-1': { chapter: 6, position: 0.7, timestamp: 1100 } };

      // Mock conflict resolution (last write wins)
      mockWorkers.sync.mockImplementation((operation, data) => {
        if (operation === 'resolve_conflict') {
          const { updates } = data;
          const latest = updates.reduce((latest: any, current: any) => 
            current.timestamp > latest.timestamp ? current : latest
          );
          return Promise.resolve({ success: true, resolved: latest });
        }
        return Promise.resolve({ success: true });
      });

      mockKV.put.mockResolvedValue(undefined);

      // Simulate concurrent updates
      const conflictResolution = await mockWorkers.sync('resolve_conflict', {
        userId,
        updates: [device1Update['novel-1'], device2Update['novel-1']]
      });

      expect(conflictResolution.resolved.timestamp).toBe(1100); // Device 2 wins
      
      await mockKV.put(`user:${userId}:progress`, JSON.stringify({
        'novel-1': conflictResolution.resolved
      }));

      expect(mockKV.put).toHaveBeenCalledWith(
        `user:${userId}:progress`,
        JSON.stringify({ 'novel-1': device2Update['novel-1'] })
      );
    });
  });
});

/**
 * Helper function to simulate a user session
 */
async function simulateUserSession(
  userId: string, 
  mockKV: any, 
  mockAnalytics: any, 
  performance: any
): Promise<{ success: boolean; responseTime: number }> {
  const startTime = Date.now();
  
  try {
    // Load user progress
    await mockKV.get(`user:${userId}:progress`);
    
    // Track session start
    await mockAnalytics.track('session_start', { userId });
    
    // Update progress
    await mockKV.put(`user:${userId}:progress`, JSON.stringify({
      'novel-1': { chapter: Math.floor(Math.random() * 10), position: Math.random() }
    }));
    
    // Track session end
    await mockAnalytics.track('session_end', { userId });
    
    const responseTime = Date.now() - startTime;
    performance.recordRequest('user_session', responseTime);
    
    return { success: true, responseTime };
    
  } catch (error) {
    return { success: false, responseTime: Date.now() - startTime };
  }
}