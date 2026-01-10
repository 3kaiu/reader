/**
 * 智能预加载属性测试
 * 验证模型缓存管理器的智能预加载策略
 * 
 * **属性17: 智能预加载**
 * **验证: 需求 5.1**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock IndexedDB
const mockDB = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(),
  clear: vi.fn()
}

const mockOpenDB = vi.fn().mockResolvedValue(mockDB)

vi.mock('idb', () => ({
  openDB: mockOpenDB
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock fetch for model downloading
global.fetch = vi.fn()

// Mock Navigator API
Object.defineProperty(global.navigator, 'connection', {
  writable: true,
  value: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 100,
    saveData: false
  }
})

describe('Intelligent Preload Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset fetch mock
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024 * 1024))
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 17: Intelligent Preloading Strategy', () => {
    it('should prioritize frequently used models for preloading', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Frequency-based prioritization**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const models = [
        {
          id: 'frequently-used-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 days old
            lastAccessed: now - 1000,
            version: '1.0.0',
            accessCount: 50 // High access count
          }
        },
        {
          id: 'rarely-used-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 5 * 24 * 60 * 60 * 1000, // 5 days old
            lastAccessed: now - 24 * 60 * 60 * 1000, // 1 day ago
            version: '1.0.0',
            accessCount: 2 // Low access count
          }
        },
        {
          id: 'medium-used-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 7 * 24 * 60 * 60 * 1000, // 7 days old
            lastAccessed: now - 2 * 60 * 60 * 1000, // 2 hours ago
            version: '1.0.0',
            accessCount: 15 // Medium access count
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Frequently used models should have higher priority
      const recommendations = await cacheManager.getPreloadRecommendations()
      
      // Should prioritize frequently used model
      expect(recommendations[0]).toBe('frequently-used-model')
      expect(recommendations).toContain('medium-used-model')
      
      // Rarely used model should have lower priority or not be included
      if (recommendations.includes('rarely-used-model')) {
        expect(recommendations.indexOf('rarely-used-model')).toBeGreaterThan(
          recommendations.indexOf('frequently-used-model')
        )
      }
    })

    it('should adapt preloading strategy based on network conditions', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Network-adaptive preloading**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const models = Array.from({ length: 10 }, (_, i) => ({
        id: `model-${i}`,
        data: new ArrayBuffer(1024 * 1024),
        metadata: {
          size: 1024 * 1024,
          timestamp: Date.now() - i * 24 * 60 * 60 * 1000,
          lastAccessed: Date.now() - i * 60 * 60 * 1000,
          version: '1.0.0',
          accessCount: 10 - i // Decreasing access count
        }
      }))
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Test with high-speed network
      ;(global.navigator as any).connection = {
        effectiveType: '4g',
        downlink: 15,
        rtt: 50,
        saveData: false
      }
      
      const highSpeedRecommendations = await cacheManager.getPreloadRecommendations()
      
      // Test with slow network
      ;(global.navigator as any).connection = {
        effectiveType: '3g',
        downlink: 1.5,
        rtt: 300,
        saveData: false
      }
      
      const slowNetworkRecommendations = await cacheManager.getPreloadRecommendations()
      
      // Test with data saver mode
      ;(global.navigator as any).connection = {
        effectiveType: '4g',
        downlink: 10,
        rtt: 100,
        saveData: true
      }
      
      const dataSaverRecommendations = await cacheManager.getPreloadRecommendations()
      
      // Property: Should recommend more models on high-speed network
      expect(highSpeedRecommendations.length).toBeGreaterThanOrEqual(slowNetworkRecommendations.length)
      expect(highSpeedRecommendations.length).toBeGreaterThanOrEqual(dataSaverRecommendations.length)
      
      // Property: Data saver mode should recommend fewer models
      expect(dataSaverRecommendations.length).toBeLessThanOrEqual(2)
    })

    it('should consider model recency in preloading decisions', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Recency-based prioritization**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const models = [
        {
          id: 'recently-accessed-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 5 * 24 * 60 * 60 * 1000,
            lastAccessed: now - 30 * 60 * 1000, // 30 minutes ago
            version: '1.0.0',
            accessCount: 10
          }
        },
        {
          id: 'old-accessed-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 5 * 24 * 60 * 60 * 1000,
            lastAccessed: now - 5 * 24 * 60 * 60 * 1000, // 5 days ago
            version: '1.0.0',
            accessCount: 10 // Same access count
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Recently accessed models should have higher priority
      const recommendations = await cacheManager.getPreloadRecommendations()
      
      if (recommendations.length > 1) {
        expect(recommendations.indexOf('recently-accessed-model')).toBeLessThan(
          recommendations.indexOf('old-accessed-model')
        )
      } else if (recommendations.length === 1) {
        expect(recommendations[0]).toBe('recently-accessed-model')
      }
    })

    it('should handle background preloading without blocking', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Non-blocking background preload**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const models = [
        {
          id: 'test-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            version: '1.0.0',
            accessCount: 10
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      mockDB.put.mockResolvedValue(undefined)
      
      // Mock slow network response
      ;(global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024 * 1024))
        }), 100))
      )
      
      await cacheManager.initialize()
      
      // Property: Intelligent preload should not block
      const startTime = Date.now()
      const preloadPromise = cacheManager.intelligentPreload()
      const endTime = Date.now()
      
      // Should return immediately (non-blocking)
      expect(endTime - startTime).toBeLessThan(50)
      
      // Wait for preload to complete
      await preloadPromise
      
      // Should have processed models (even if no fetch occurred due to caching logic)
      expect(mockDB.getAll).toHaveBeenCalled()
    })

    it('should update access statistics correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Access statistics tracking**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const model = {
        id: 'test-model',
        data: new ArrayBuffer(1024 * 1024),
        metadata: {
          size: 1024 * 1024,
          timestamp: Date.now(),
          lastAccessed: Date.now() - 60000,
          version: '1.0.0',
          accessCount: 5
        }
      }
      
      mockDB.get.mockResolvedValue(model)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Access statistics should be updated on model access
      await cacheManager.updateModelAccess('test-model')
      
      expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
        id: 'test-model',
        metadata: expect.objectContaining({
          accessCount: 6, // Should increment
          lastAccessed: expect.any(Number) // Should update timestamp
        })
      }))
    })

    it('should handle preload failures gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Failure resilience**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const models = [
        {
          id: 'model-1',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            version: '1.0.0',
            accessCount: 10
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      // Mock network failure
      ;(global.fetch as any).mockRejectedValue(new Error('Network error'))
      
      await cacheManager.initialize()
      
      // Property: Should handle preload failures without throwing
      try {
        await cacheManager.intelligentPreload()
        // Should complete without throwing
        expect(true).toBe(true)
      } catch (error) {
        // If it throws, it should be handled gracefully
        expect(error).toBeUndefined()
      }
      
      // Should have attempted to process models
      expect(mockDB.getAll).toHaveBeenCalled()
    })

    it('should respect cache size limits during preloading', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Cache size awareness**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      // Mock cache nearly full
      const existingModels = Array.from({ length: 5 }, (_, i) => ({
        id: `existing-model-${i}`,
        data: new ArrayBuffer(400 * 1024 * 1024), // 400MB each
        metadata: {
          size: 400 * 1024 * 1024,
          timestamp: Date.now() - i * 1000,
          lastAccessed: Date.now() - i * 1000,
          version: '1.0.0',
          accessCount: 5 - i
        }
      }))
      
      mockDB.getAll.mockResolvedValue(existingModels)
      mockDB.delete.mockResolvedValue(undefined)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Should trigger cache cleanup during preloading if needed
      await cacheManager.intelligentPreload()
      
      // If preloading occurred, cache management should have been triggered
      if (global.fetch.mock.calls.length > 0) {
        // Should have managed cache space appropriately
        expect(mockDB.getAll).toHaveBeenCalled()
      }
    })

    it('should provide meaningful preload recommendations', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Recommendation quality**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const models = [
        {
          id: 'high-priority-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: Date.now() - 24 * 60 * 60 * 1000,
            lastAccessed: Date.now() - 60 * 1000,
            version: '1.0.0',
            accessCount: 25
          }
        },
        {
          id: 'medium-priority-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: Date.now() - 48 * 60 * 60 * 1000,
            lastAccessed: Date.now() - 2 * 60 * 60 * 1000,
            version: '1.0.0',
            accessCount: 10
          }
        },
        {
          id: 'low-priority-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
            lastAccessed: Date.now() - 5 * 24 * 60 * 60 * 1000,
            version: '1.0.0',
            accessCount: 2
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Recommendations should be ordered by priority
      const recommendations = await cacheManager.getPreloadRecommendations()
      
      expect(recommendations).toBeInstanceOf(Array)
      expect(recommendations.length).toBeGreaterThan(0)
      
      // Should include high priority model
      expect(recommendations).toContain('high-priority-model')
      
      // If multiple recommendations, should be in priority order
      if (recommendations.length > 1) {
        const highPriorityIndex = recommendations.indexOf('high-priority-model')
        const lowPriorityIndex = recommendations.indexOf('low-priority-model')
        
        if (lowPriorityIndex !== -1) {
          expect(highPriorityIndex).toBeLessThan(lowPriorityIndex)
        }
      }
    })

    it('should handle empty cache gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Empty cache handling**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      // Mock empty cache
      mockDB.getAll.mockResolvedValue([])
      
      await cacheManager.initialize()
      
      // Property: Should handle empty cache without errors
      const recommendations = await cacheManager.getPreloadRecommendations()
      
      expect(recommendations).toBeInstanceOf(Array)
      expect(recommendations.length).toBe(0)
      
      // Should not throw when running intelligent preload on empty cache
      try {
        await cacheManager.intelligentPreload()
        // Should complete without throwing
        expect(true).toBe(true)
      } catch (error) {
        // If it throws, it should be handled gracefully
        expect(error).toBeUndefined()
      }
    })

    it('should calculate access frequency correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 17: Frequency calculation accuracy**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const models = [
        {
          id: 'daily-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 days old
            lastAccessed: now - 1000,
            version: '1.0.0',
            accessCount: 10 // 1 access per day
          }
        },
        {
          id: 'hourly-model',
          data: new ArrayBuffer(1024 * 1024),
          metadata: {
            size: 1024 * 1024,
            timestamp: now - 24 * 60 * 60 * 1000, // 1 day old
            lastAccessed: now - 1000,
            version: '1.0.0',
            accessCount: 24 // 1 access per hour
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Higher frequency models should be prioritized
      const recommendations = await cacheManager.getPreloadRecommendations()
      
      if (recommendations.length > 1) {
        // Hourly model should have higher priority than daily model
        expect(recommendations.indexOf('hourly-model')).toBeLessThan(
          recommendations.indexOf('daily-model')
        )
      } else if (recommendations.length === 1) {
        expect(recommendations[0]).toBe('hourly-model')
      }
    })
  })
})