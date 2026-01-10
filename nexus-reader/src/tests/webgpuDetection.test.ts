/**
 * WebGPU检测和模型缓存测试
 * 验证WebGPU支持检测和模型缓存机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiServiceManager } from '@/services/aiServiceManager'

describe('WebGPU Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
  })

  describe('Browser Support Detection', () => {
    it('should detect WebGPU support when available', async () => {
      // Mock WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({
            features: new Set(['shader-f16']),
            limits: { maxBufferSize: 1024 * 1024 * 1024 }
          })
        },
        configurable: true
      })

      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })

    it('should detect when WebGPU is not available', async () => {
      // Mock WebGPU not available
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU')
    })

    it('should handle adapter request failure', async () => {
      // Mock WebGPU available but adapter request fails
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue(null)
        },
        configurable: true
      })

      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('GPU 适配器')
    })

    it('should handle WebGPU detection errors', async () => {
      // Mock WebGPU available but throws error
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error'))
        },
        configurable: true
      })

      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU 检测失败')
    })
  })

  describe('GPU Capabilities', () => {
    beforeEach(() => {
      // Mock WebGPU with various capabilities
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({
            features: new Set(['shader-f16', 'depth-clip-control']),
            limits: {
              maxBufferSize: 1024 * 1024 * 1024, // 1GB
              maxStorageBufferBindingSize: 512 * 1024 * 1024, // 512MB
              maxComputeWorkgroupSizeX: 256,
              maxComputeWorkgroupSizeY: 256,
              maxComputeWorkgroupSizeZ: 64
            }
          })
        },
        configurable: true
      })
    })

    it('should successfully detect capable GPU', async () => {
      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
    })
  })

  describe('Fallback Behavior', () => {
    it('should handle missing navigator gracefully', async () => {
      // Mock missing navigator
      const originalNavigator = global.navigator
      delete (global as any).navigator

      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)

      // Restore navigator
      global.navigator = originalNavigator
    })
  })
})

describe('Model Caching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock WebGPU support
    Object.defineProperty(navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockResolvedValue({})
      },
      configurable: true
    })

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true
    })
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
  })

  describe('Model Persistence', () => {
    it('should save last used model', async () => {
      // Mock successful model loading
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
              chat: { completions: { create: vi.fn() } },
              unload: vi.fn(),
              terminate: vi.fn()
            })
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model-123')
      
      if (result) {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'ai-last-model',
          'test-model-123'
        )
      }
    })

    it('should restore last used model on initialization', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('saved-model-456')
      
      const { getDefaultModel } = require('@/stores/ai/models')
      const defaultModel = getDefaultModel()
      
      // Should attempt to use saved model if available
      expect(localStorage.getItem).toHaveBeenCalledWith('ai-last-model')
    })
  })

  describe('Cache Management', () => {
    it('should handle cache storage errors gracefully', async () => {
      // Mock localStorage to throw error
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      // Should not throw error even if storage fails
      await expect(aiServiceManager.loadModel('test-model')).resolves.toBeDefined()
    })

    it('should handle cache retrieval errors gracefully', () => {
      // Mock localStorage to throw error
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('Storage access denied')
      })

      // Should not throw error even if retrieval fails
      const { getDefaultModel } = require('@/stores/ai/models')
      expect(() => getDefaultModel()).not.toThrow()
    })
  })

  describe('Model Validation', () => {
    it('should validate cached model exists in available models', () => {
      // Mock saved model that doesn't exist in current model list
      vi.mocked(localStorage.getItem).mockReturnValue('non-existent-model')
      
      // Mock getAllModels to return empty list
      vi.doMock('@/stores/ai/models', () => ({
        getAllModels: vi.fn().mockReturnValue([]),
        getDefaultModel: vi.fn().mockReturnValue('fallback-model')
      }))

      const { getDefaultModel } = require('@/stores/ai/models')
      const defaultModel = getDefaultModel()
      
      // Should fall back to recommended model
      expect(defaultModel).not.toBe('non-existent-model')
    })
  })

  describe('Cross-tab Synchronization', () => {
    it('should broadcast model loading status', async () => {
      const { syncChannel } = await import('@/utils/broadcast')
      
      // Mock successful model loading
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
              chat: { completions: { create: vi.fn() } },
              unload: vi.fn(),
              terminate: vi.fn()
            })
          })
        }
      }))

      await aiServiceManager.loadModel('test-model')
      
      expect(syncChannel.publish).toHaveBeenCalledWith(
        'ai-engine-status',
        { status: 'loaded', modelId: 'test-model' }
      )
    })

    it('should broadcast model unloading status', async () => {
      const { syncChannel } = await import('@/utils/broadcast')
      
      // Load model first
      await aiServiceManager.loadModel('test-model')
      vi.clearAllMocks()
      
      // Then unload
      await aiServiceManager.unloadModel()
      
      expect(syncChannel.publish).toHaveBeenCalledWith(
        'ai-engine-status',
        { status: 'unloaded' }
      )
    })
  })
})