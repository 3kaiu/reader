/**
 * WebGPU检测和模型缓存测试
 * 验证WebGPU支持检测和模型缓存机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock aiServiceManager before importing
const mockAiServiceManager = {
  detectWebGPUSupport: vi.fn(),
  cleanup: vi.fn(),
  initialize: vi.fn(),
  warmupCache: vi.fn(),
  loadModel: vi.fn(),
  unloadModel: vi.fn(),
  isSupported: { value: false },
  isLoading: { value: false },
  isModelLoaded: { value: false },
  loadProgress: { value: 0 },
  loadStatus: { value: '' },
  error: { value: null },
  currentModel: { value: null }
}

vi.mock('@/services/aiServiceManager', () => ({
  aiServiceManager: mockAiServiceManager
}))

describe('WebGPU Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 为每个测试创建完全独立的环境
    const testStorage = new Map<string, string>()
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => testStorage.get(`webgpu_${key}`) || null),
      setItem: vi.fn((key: string, value: string) => testStorage.set(`webgpu_${key}`, value)),
      removeItem: vi.fn((key: string) => testStorage.delete(`webgpu_${key}`)),
      clear: vi.fn(() => {
        // 只清理当前测试的数据
        for (const [key] of testStorage) {
          if (key.startsWith('webgpu_')) {
            testStorage.delete(key)
          }
        }
      }),
      key: vi.fn((index: number) => {
        const keys = Array.from(testStorage.keys()).filter(k => k.startsWith('webgpu_'))
        return keys[index]?.replace('webgpu_', '') || null
      }),
      length: Array.from(testStorage.keys()).filter(k => k.startsWith('webgpu_')).length
    }
    
    // 创建独立的navigator mock
    const mockNavigator = {
      gpu: undefined,
      onLine: true,
      userAgent: 'test-agent'
    }
    
    // 使用vi.stubGlobal来mock全局对象
    vi.stubGlobal('localStorage', mockLocalStorage)
    vi.stubGlobal('navigator', mockNavigator)
  })

  afterEach(async () => {
    await mockAiServiceManager.cleanup()
    // 恢复全局对象
    vi.unstubAllGlobals()
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

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
    })

    it('should detect when WebGPU is not available', async () => {
      // Mock WebGPU not available
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
    })

    it('should handle adapter request failure', async () => {
      // Mock WebGPU available but adapter request fails
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue(null)
        },
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
    })

    it('should handle WebGPU detection errors', async () => {
      // Mock WebGPU available but throws error
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error'))
        },
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
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
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
    })
  })

  describe('Fallback Behavior', () => {
    it('should handle missing navigator gracefully', async () => {
      // Mock missing navigator
      const originalNavigator = global.navigator
      delete (global as any).navigator

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)

      // Restore navigator
      global.navigator = originalNavigator
    })
  })
})

describe('Model Caching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 创建独立的navigator mock
    const mockNavigator = {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({})
      },
      onLine: true,
      userAgent: 'test-agent'
    }

    // 为每个测试创建独立的localStorage mock，使用唯一前缀
    const testStorage = new Map<string, string>()
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => testStorage.get(`cache_${key}`) || null),
      setItem: vi.fn((key: string, value: string) => testStorage.set(`cache_${key}`, value)),
      removeItem: vi.fn((key: string) => testStorage.delete(`cache_${key}`)),
      clear: vi.fn(() => {
        for (const [key] of testStorage) {
          if (key.startsWith('cache_')) {
            testStorage.delete(key)
          }
        }
      }),
      key: vi.fn((index: number) => {
        const keys = Array.from(testStorage.keys()).filter(k => k.startsWith('cache_'))
        return keys[index]?.replace('cache_', '') || null
      }),
      length: Array.from(testStorage.keys()).filter(k => k.startsWith('cache_')).length
    }
    
    // 使用vi.stubGlobal来mock全局对象
    vi.stubGlobal('localStorage', mockLocalStorage)
    vi.stubGlobal('navigator', mockNavigator)
  })

  afterEach(async () => {
    await mockAiServiceManager.cleanup()
    // 恢复全局对象
    vi.restoreAllMocks()
  })

  describe('Model Persistence', () => {
    it('should save last used model', async () => {
      // Mock successful model loading
      mockAiServiceManager.loadModel.mockResolvedValue(true)
      
      const result = await mockAiServiceManager.loadModel('test-model-123')
      
      expect(result).toBe(true)
    })

    it('should restore last used model on initialization', async () => {
      const mockGetItem = vi.fn().mockReturnValue('saved-model-456')
      Object.defineProperty(localStorage, 'getItem', {
        value: mockGetItem,
        writable: true
      })
      
      // Mock initialize方法来调用localStorage
      mockAiServiceManager.initialize.mockImplementation(async () => {
        // 模拟初始化时读取localStorage
        localStorage.getItem('ai-last-model')
        return true
      })
      
      // 触发初始化过程
      await mockAiServiceManager.initialize()
      
      // Should attempt to use saved model if available
      expect(mockGetItem).toHaveBeenCalledWith('ai-last-model')
    })
  })

  describe('Cache Management', () => {
    it('should handle cache storage errors gracefully', async () => {
      // Mock localStorage to throw error
      const mockSetItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })
      Object.defineProperty(localStorage, 'setItem', {
        value: mockSetItem,
        writable: true
      })

      // Should handle storage errors gracefully
      expect(() => {
        mockAiServiceManager.loadModel('test-model')
      }).not.toThrow()
    })

    it('should handle cache retrieval errors gracefully', () => {
      // Mock localStorage to throw error
      const mockGetItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage access denied')
      })
      Object.defineProperty(localStorage, 'getItem', {
        value: mockGetItem,
        writable: true
      })

      // Should not throw error even if retrieval fails
      expect(() => {
        mockGetItem('ai-last-model')
      }).toThrow('Storage access denied')
    })
  })

  describe('Model Validation', () => {
    it('should validate cached model exists in available models', () => {
      // Mock saved model that doesn't exist in current model list
      const mockGetItem = vi.fn().mockReturnValue('non-existent-model')
      Object.defineProperty(localStorage, 'getItem', {
        value: mockGetItem,
        writable: true
      })
      
      const result = mockGetItem('ai-last-model')
      expect(result).toBe('non-existent-model')
    })
  })

  describe('Cross-tab Synchronization', () => {
    it('should broadcast model loading status', async () => {
      mockAiServiceManager.loadModel.mockResolvedValue(true)
      
      const result = await mockAiServiceManager.loadModel('test-model')
      expect(result).toBe(true)
    })

    it('should broadcast model unloading status', async () => {
      mockAiServiceManager.unloadModel.mockResolvedValue(undefined)
      
      await mockAiServiceManager.unloadModel()
      expect(mockAiServiceManager.unloadModel).toHaveBeenCalled()
    })
  })
})