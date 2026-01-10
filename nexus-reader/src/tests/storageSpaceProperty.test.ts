/**
 * 存储空间管理属性测试
 * 验证模型缓存管理器的存储空间管理机制
 * 
 * **属性19: 存储空间管理**
 * **验证: 需求 5.3**
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

describe('Storage Space Management Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 19: Storage Space Management', () => {
    it('should enforce maximum cache size limits', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Cache size enforcement**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      // Mock existing models that fill most of the cache
      const existingModels = [
        {
          id: 'model-1',
          data: new ArrayBuffer(1024 * 1024 * 1024), // 1GB
          metadata: {
            size: 1024 * 1024 * 1024,
            timestamp: Date.now() - 1000,
            lastAccessed: Date.now() - 1000,
            version: '1.0.0'
          }
        },
        {
          id: 'model-2', 
          data: new ArrayBuffer(800 * 1024 * 1024), // 800MB
          metadata: {
            size: 800 * 1024 * 1024,
            timestamp: Date.now() - 2000,
            lastAccessed: Date.now() - 2000,
            version: '1.0.0'
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(existingModels)
      mockDB.delete.mockResolvedValue(undefined)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Adding a large model should trigger LRU cleanup
      const newModelData = new ArrayBuffer(500 * 1024 * 1024) // 500MB
      
      await cacheManager.cacheModel('model-3', newModelData)
      
      // Should have removed the oldest model to make space
      expect(mockDB.delete).toHaveBeenCalledWith('models', 'model-2')
      expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
        id: 'model-3',
        data: newModelData
      }))
    })

    it('should use LRU strategy for cache eviction', async () => {
      // **Feature: client-side-ai-optimization, Property 19: LRU eviction strategy**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const existingModels = [
        {
          id: 'oldest-model',
          data: new ArrayBuffer(1024 * 1024 * 1024),
          metadata: {
            size: 1024 * 1024 * 1024,
            timestamp: now - 10000,
            lastAccessed: now - 10000, // Oldest access
            version: '1.0.0'
          }
        },
        {
          id: 'middle-model',
          data: new ArrayBuffer(512 * 1024 * 1024),
          metadata: {
            size: 512 * 1024 * 1024,
            timestamp: now - 5000,
            lastAccessed: now - 5000, // Middle access
            version: '1.0.0'
          }
        },
        {
          id: 'newest-model',
          data: new ArrayBuffer(512 * 1024 * 1024),
          metadata: {
            size: 512 * 1024 * 1024,
            timestamp: now - 1000,
            lastAccessed: now - 1000, // Most recent access
            version: '1.0.0'
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(existingModels)
      mockDB.delete.mockResolvedValue(undefined)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: LRU should remove oldest accessed model first
      const newModelData = new ArrayBuffer(200 * 1024 * 1024) // 200MB
      
      await cacheManager.cacheModel('new-model', newModelData)
      
      // Should remove the oldest accessed model
      expect(mockDB.delete).toHaveBeenCalledWith('models', 'oldest-model')
      
      // Should not remove newer models
      expect(mockDB.delete).not.toHaveBeenCalledWith('models', 'middle-model')
      expect(mockDB.delete).not.toHaveBeenCalledWith('models', 'newest-model')
    })

    it('should accurately track cache size', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Accurate size tracking**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const models = [
        {
          id: 'model-1',
          data: new ArrayBuffer(100 * 1024 * 1024), // 100MB
          metadata: {
            size: 100 * 1024 * 1024,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            version: '1.0.0'
          }
        },
        {
          id: 'model-2',
          data: new ArrayBuffer(200 * 1024 * 1024), // 200MB
          metadata: {
            size: 200 * 1024 * 1024,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            version: '1.0.0'
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Cache stats should accurately reflect total size
      const stats = await cacheManager.getCacheStats()
      
      expect(stats.totalSize).toBe(300 * 1024 * 1024) // 300MB total
      expect(stats.modelCount).toBe(2)
    })

    it('should handle cache space calculations correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Space calculation accuracy**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      // Mock empty cache initially
      mockDB.getAll.mockResolvedValue([])
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Should allow caching when under size limit
      const smallModelData = new ArrayBuffer(100 * 1024 * 1024) // 100MB
      
      await cacheManager.cacheModel('small-model', smallModelData)
      
      // Should cache without issues
      expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
        id: 'small-model',
        data: smallModelData,
        metadata: expect.objectContaining({
          size: 100 * 1024 * 1024
        })
      }))
      
      // Should not trigger any deletions
      expect(mockDB.delete).not.toHaveBeenCalled()
    })

    it('should handle multiple evictions when necessary', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Multiple eviction handling**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      // Create many small models that together exceed cache limit
      const existingModels = Array.from({ length: 10 }, (_, i) => ({
        id: `model-${i}`,
        data: new ArrayBuffer(300 * 1024 * 1024), // 300MB each
        metadata: {
          size: 300 * 1024 * 1024,
          timestamp: now - (10 - i) * 1000, // Older models have earlier timestamps
          lastAccessed: now - (10 - i) * 1000,
          version: '1.0.0'
        }
      }))
      
      mockDB.getAll.mockResolvedValue(existingModels)
      mockDB.delete.mockResolvedValue(undefined)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Should evict multiple models if needed
      const largeModelData = new ArrayBuffer(1024 * 1024 * 1024) // 1GB
      
      await cacheManager.cacheModel('large-model', largeModelData)
      
      // Should have deleted multiple old models to make space
      expect(mockDB.delete).toHaveBeenCalled()
      
      // Should have cached the new model
      expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
        id: 'large-model',
        data: largeModelData
      }))
    })

    it('should preserve recently accessed models during eviction', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Recent access preservation**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const existingModels = [
        {
          id: 'old-unused',
          data: new ArrayBuffer(1024 * 1024 * 1024),
          metadata: {
            size: 1024 * 1024 * 1024,
            timestamp: now - 100000,
            lastAccessed: now - 100000, // Very old access
            version: '1.0.0'
          }
        },
        {
          id: 'recently-used',
          data: new ArrayBuffer(1024 * 1024 * 1024),
          metadata: {
            size: 1024 * 1024 * 1024,
            timestamp: now - 50000,
            lastAccessed: now - 100, // Recently accessed
            version: '1.0.0'
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(existingModels)
      mockDB.delete.mockResolvedValue(undefined)
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Should preserve recently accessed models
      const newModelData = new ArrayBuffer(200 * 1024 * 1024) // 200MB
      
      await cacheManager.cacheModel('new-model', newModelData)
      
      // Should remove the old unused model, not the recently used one
      expect(mockDB.delete).toHaveBeenCalledWith('models', 'old-unused')
      expect(mockDB.delete).not.toHaveBeenCalledWith('models', 'recently-used')
    })

    it('should handle edge cases in space management', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Edge case handling**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      // Test with zero-size model
      mockDB.getAll.mockResolvedValue([])
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Should handle zero-size models gracefully
      const zeroSizeData = new ArrayBuffer(0)
      
      await cacheManager.cacheModel('zero-size', zeroSizeData)
      
      expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
        id: 'zero-size',
        data: zeroSizeData,
        metadata: expect.objectContaining({
          size: 0
        })
      }))
    })

    it('should maintain cache consistency during concurrent operations', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Concurrent operation safety**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      mockDB.getAll.mockResolvedValue([])
      mockDB.put.mockResolvedValue(undefined)
      
      await cacheManager.initialize()
      
      // Property: Concurrent cache operations should not corrupt state
      const promises = Array.from({ length: 5 }, (_, i) => 
        cacheManager.cacheModel(`concurrent-model-${i}`, new ArrayBuffer(100 * 1024 * 1024))
      )
      
      await Promise.all(promises)
      
      // All models should be cached
      expect(mockDB.put).toHaveBeenCalledTimes(5)
      
      // Each model should have correct metadata
      for (let i = 0; i < 5; i++) {
        expect(mockDB.put).toHaveBeenCalledWith('models', expect.objectContaining({
          id: `concurrent-model-${i}`,
          metadata: expect.objectContaining({
            size: 100 * 1024 * 1024
          })
        }))
      }
    })

    it('should provide accurate cache statistics', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Statistics accuracy**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      const now = Date.now()
      const models = [
        {
          id: 'model-1',
          data: new ArrayBuffer(100 * 1024 * 1024),
          metadata: {
            size: 100 * 1024 * 1024,
            timestamp: now - 5000,
            lastAccessed: now - 1000, // Most recent
            version: '1.0.0'
          }
        },
        {
          id: 'model-2',
          data: new ArrayBuffer(200 * 1024 * 1024),
          metadata: {
            size: 200 * 1024 * 1024,
            timestamp: now - 10000,
            lastAccessed: now - 5000, // Oldest
            version: '1.0.0'
          }
        }
      ]
      
      mockDB.getAll.mockResolvedValue(models)
      
      await cacheManager.initialize()
      
      // Property: Statistics should accurately reflect cache state
      const stats = await cacheManager.getCacheStats()
      
      expect(stats.totalSize).toBe(300 * 1024 * 1024)
      expect(stats.modelCount).toBe(2)
      expect(stats.oldestAccess).toBe(now - 5000)
      expect(stats.newestAccess).toBe(now - 1000)
    })

    it('should handle cache clearing correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 19: Cache clearing**
      
      const { ModelCacheManager } = await import('@/utils/modelCacheManager')
      
      // Reset singleton for testing
      ;(ModelCacheManager as any).instance = null
      const cacheManager = ModelCacheManager.getInstance()
      
      mockDB.clear.mockResolvedValue(undefined)
      mockDB.getAll.mockResolvedValueOnce([
        { id: 'model-1', metadata: { size: 100 } },
        { id: 'model-2', metadata: { size: 200 } }
      ]).mockResolvedValueOnce([]) // After clearing
      
      await cacheManager.initialize()
      
      // Property: Cache clearing should remove all models
      await cacheManager.clearCache()
      
      expect(mockDB.clear).toHaveBeenCalledWith('models')
      
      // Stats should reflect empty cache
      const stats = await cacheManager.getCacheStats()
      expect(stats.totalSize).toBe(0)
      expect(stats.modelCount).toBe(0)
    })
  })
})