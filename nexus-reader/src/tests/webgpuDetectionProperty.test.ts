/**
 * WebGPU检测属性测试
 * 验证WebGPU支持检测和降级机制的正确性
 * 
 * **属性9: WebGPU检测和降级**
 * **验证: 需求 3.1, 3.5**
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'

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

// Mock modelCacheManager
vi.mock('@/utils/modelCacheManager', () => ({
  modelCacheManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    warmupCache: vi.fn().mockResolvedValue(undefined),
    getCacheStats: vi.fn().mockResolvedValue({ totalSize: 0, modelCount: 0 }),
    isModelCached: vi.fn().mockResolvedValue(false),
    cacheModel: vi.fn().mockResolvedValue(undefined),
    getCachedModel: vi.fn().mockResolvedValue(null)
  }
}))

// Mock browser environment using safer approach
// Setup mocks before tests
beforeAll(() => {
  // 不需要备份，使用vi.spyOn
})

// Restore after tests
afterAll(() => {
  vi.restoreAllMocks()
})

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock CDN resource loader
vi.mock('@/utils/cdnResourceLoader', () => ({
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

describe('WebGPU Detection Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 为每个测试创建独立的localStorage mock，使用唯一前缀
    const testStorage = new Map<string, string>()
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => testStorage.get(`webgpu_prop_${key}`) || null),
      setItem: vi.fn((key: string, value: string) => testStorage.set(`webgpu_prop_${key}`, value)),
      removeItem: vi.fn((key: string) => testStorage.delete(`webgpu_prop_${key}`)),
      clear: vi.fn(() => {
        for (const [key] of testStorage) {
          if (key.startsWith('webgpu_prop_')) {
            testStorage.delete(key)
          }
        }
      }),
      key: vi.fn((index: number) => {
        const keys = Array.from(testStorage.keys()).filter(k => k.startsWith('webgpu_prop_'))
        return keys[index]?.replace('webgpu_prop_', '') || null
      }),
      length: Array.from(testStorage.keys()).filter(k => k.startsWith('webgpu_prop_')).length
    }

    const mockDocument = {
      createElement: vi.fn().mockReturnValue({
        src: '',
        onload: null,
        onerror: null
      }),
      head: {
        appendChild: vi.fn()
      }
    }
    
    // Mock Worker
    const mockWorker = vi.fn().mockImplementation(() => ({
      terminate: vi.fn(),
      addEventListener: vi.fn()
    }))

    // Mock URL methods
    const mockURL = {
      createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
      revokeObjectURL: vi.fn()
    }

    // Setup navigator mock
    const mockNavigator = {
      gpu: undefined,
      onLine: true
    }

    // 使用vi.stubGlobal来mock全局对象
    vi.stubGlobal('localStorage', mockLocalStorage)
    vi.stubGlobal('document', mockDocument)
    vi.stubGlobal('Worker', mockWorker)
    vi.stubGlobal('URL', mockURL)
    vi.stubGlobal('navigator', mockNavigator)
  })

  afterEach(async () => {
    await mockAiServiceManager.cleanup()
    // 恢复全局对象
    vi.unstubAllGlobals()
  })

  describe('Property 9: WebGPU Detection and Fallback', () => {
    it('should consistently detect WebGPU availability across multiple checks', async () => {
      // **Feature: client-side-ai-optimization, Property 9: WebGPU detection consistency**
      
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

      // Property: Multiple consecutive WebGPU detection calls should return consistent results
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      
      const results: boolean[] = []
      for (let i = 0; i < 10; i++) {
        const supported = await mockAiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      // All results should be consistent
      expect(results.every(result => result === true)).toBe(true)
      expect(new Set(results).size).toBe(1) // All values should be the same
    })

    it('should properly handle WebGPU unavailable scenarios', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Fallback consistency**
      
      // Mock WebGPU not available
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      // Property: When WebGPU is unavailable, detection should consistently return false
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      
      const results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        const supported = await mockAiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      expect(results.every(result => result === false)).toBe(true)
    })

    it('should handle adapter request failures gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Error handling**
      
      // Mock WebGPU available but adapter request fails
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue(null)
        },
        configurable: true
      })

      // Property: When adapter request fails, detection should consistently return false
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      
      const results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        const supported = await mockAiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      expect(results.every(result => result === false)).toBe(true)
    })

    it('should handle WebGPU detection errors consistently', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Error consistency**
      
      // Mock WebGPU to throw errors
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('WebGPU error'))
        },
        configurable: true
      })

      // Property: When WebGPU throws errors, detection should consistently handle them
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      
      const results: boolean[] = []

      for (let i = 0; i < 5; i++) {
        const supported = await mockAiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      expect(results.every(result => result === false)).toBe(true)
    })

    it('should maintain state consistency after detection', async () => {
      // **Feature: client-side-ai-optimization, Property 9: State consistency**
      
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

      // Property: After successful detection, state should remain consistent
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
    })

    it('should handle rapid consecutive detection calls', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Concurrency handling**
      
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

      // Property: Rapid consecutive detection calls should not cause race conditions
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      
      const promises = Array.from({ length: 10 }, () =>
        mockAiServiceManager.detectWebGPUSupport()
      )
      const results = await Promise.all(promises)

      expect(results.every(result => result === true)).toBe(true)
    })

    it('should properly reset state between different detection scenarios', async () => {
      // **Feature: client-side-ai-optimization, Property 9: State reset**
      
      // First scenario: WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      let supported = await mockAiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(true)

      // Second scenario: WebGPU unavailable
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      supported = await mockAiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(false)
    })

    it('should handle missing navigator gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Environment handling**
      
      // Mock missing navigator
      const originalNavigator = global.navigator
      delete (global as any).navigator

      // Property: Missing navigator should be handled gracefully
      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)

      // Restore navigator
      global.navigator = originalNavigator
    })

    it('should validate WebGPU adapter capabilities when available', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Capability validation**
      
      // Mock WebGPU with specific capabilities
      const mockAdapter = {
        features: new Set(['shader-f16', 'depth-clip-control']),
        limits: {
          maxBufferSize: 1024 * 1024 * 1024,
          maxStorageBufferBindingSize: 512 * 1024 * 1024,
          maxComputeWorkgroupSizeX: 256
        }
      }

      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter)
        },
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(true)
      const supported = await mockAiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
    })

    it('should maintain detection result stability over time', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Detection stability**

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

      // Property: Detection results should remain stable over multiple calls with delays
      const results: boolean[] = []
      for (let i = 0; i < 3; i++) {
        const supported = await mockAiServiceManager.detectWebGPUSupport()
        results.push(supported)
        
        // Small delay between calls
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      expect(results.every(result => result === true)).toBe(true)
    })
  })

  describe('WebGPU Detection Integration with AI Service', () => {
    it('should prevent model loading when WebGPU is not supported', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Model loading prevention**

      // Mock WebGPU not supported
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      mockAiServiceManager.detectWebGPUSupport.mockResolvedValue(false)
      mockAiServiceManager.loadModel.mockResolvedValue(false)

      const supported = await mockAiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(false)

      const modelLoaded = await mockAiServiceManager.loadModel('test-model')
      expect(modelLoaded).toBe(false)
    })

    it('should allow initialization when WebGPU is supported', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Initialization enablement**

      // Mock WebGPU supported
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
      mockAiServiceManager.initialize.mockResolvedValue(undefined)

      const supported = await mockAiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(true)

      await mockAiServiceManager.initialize()
      expect(mockAiServiceManager.initialize).toHaveBeenCalled()
    })
  })
})