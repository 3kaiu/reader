/**
 * WebGPU检测属性测试
 * 验证WebGPU支持检测和降级机制的正确性
 * 
 * **属性9: WebGPU检测和降级**
 * **验证: 需求 3.1, 3.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiServiceManager } from '@/services/aiServiceManager'

// Mock browser environment
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  configurable: true
})

Object.defineProperty(global, 'document', {
  value: {
    createElement: vi.fn().mockReturnValue({
      src: '',
      onload: null,
      onerror: null
    }),
    head: {
      appendChild: vi.fn()
    }
  },
  configurable: true
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
    
    // Mock Worker
    global.Worker = vi.fn().mockImplementation(() => ({
      terminate: vi.fn(),
      addEventListener: vi.fn()
    })) as any

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
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
      const results: boolean[] = []
      for (let i = 0; i < 10; i++) {
        const supported = await aiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      // All results should be the same (consistent detection)
      const firstResult = results[0]
      expect(results.every(result => result === firstResult)).toBe(true)
      
      // All should be true since WebGPU is mocked as available
      expect(results.every(result => result === true)).toBe(true)
    })

    it('should properly handle WebGPU unavailable scenarios', async () => {
      // **Feature: client-side-ai-optimization, Property 9: WebGPU unavailable handling**
      
      // Mock WebGPU not available
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      // Property: When WebGPU is unavailable, detection should consistently return false
      const results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        const supported = await aiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      // All results should be false
      expect(results.every(result => result === false)).toBe(true)
      
      // Error message should be set
      expect(aiServiceManager.error.value).toContain('WebGPU')
      expect(aiServiceManager.isSupported.value).toBe(false)
    })

    it('should handle adapter request failures gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Adapter failure handling**
      
      // Mock WebGPU available but adapter request fails
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue(null)
        },
        configurable: true
      })

      // Property: When adapter request fails, detection should consistently return false
      const results: boolean[] = []
      for (let i = 0; i < 5; i++) {
        const supported = await aiServiceManager.detectWebGPUSupport()
        results.push(supported)
      }

      // All results should be false
      expect(results.every(result => result === false)).toBe(true)
      
      // Appropriate error message should be set
      expect(aiServiceManager.error.value).toContain('GPU 适配器')
      expect(aiServiceManager.isSupported.value).toBe(false)
    })

    it('should handle WebGPU detection errors consistently', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Error handling consistency**
      
      // Mock WebGPU to throw errors
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockRejectedValue(new Error('GPU initialization failed'))
        },
        configurable: true
      })

      // Property: When WebGPU throws errors, detection should consistently handle them
      const results: boolean[] = []
      const errorMessages: string[] = []
      
      for (let i = 0; i < 5; i++) {
        const supported = await aiServiceManager.detectWebGPUSupport()
        results.push(supported)
        errorMessages.push(aiServiceManager.error.value || '')
      }

      // All results should be false
      expect(results.every(result => result === false)).toBe(true)
      
      // All error messages should indicate WebGPU detection failure
      expect(errorMessages.every(msg => msg.includes('WebGPU 检测失败'))).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(false)
    })

    it('should maintain state consistency after detection', async () => {
      // **Feature: client-side-ai-optimization, Property 9: State consistency**
      
      // Mock WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      // Property: After successful detection, state should remain consistent
      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
      
      // State should remain consistent across multiple reads
      for (let i = 0; i < 10; i++) {
        expect(aiServiceManager.isSupported.value).toBe(true)
        expect(aiServiceManager.error.value).toBeNull()
      }
    })

    it('should handle rapid consecutive detection calls', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Concurrent detection handling**
      
      // Mock WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      // Property: Rapid consecutive detection calls should not cause race conditions
      const promises = Array.from({ length: 10 }, () => 
        aiServiceManager.detectWebGPUSupport()
      )
      
      const results = await Promise.all(promises)
      
      // All results should be the same
      const firstResult = results[0]
      expect(results.every(result => result === firstResult)).toBe(true)
      
      // Final state should be consistent
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })

    it('should properly reset state between different detection scenarios', async () => {
      // **Feature: client-side-ai-optimization, Property 9: State reset consistency**
      
      // First scenario: WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      let supported = await aiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()

      // Second scenario: WebGPU unavailable
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      supported = await aiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU')

      // Third scenario: WebGPU available again
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      supported = await aiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })

    it('should handle missing navigator gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Missing navigator handling**
      
      // Mock missing navigator
      const originalNavigator = global.navigator
      delete (global as any).navigator

      // Property: Missing navigator should be handled gracefully
      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU')

      // Restore navigator
      global.navigator = originalNavigator
    })

    it('should validate WebGPU adapter capabilities when available', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Adapter capability validation**
      
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

      // Property: When adapter is available, detection should succeed
      const supported = await aiServiceManager.detectWebGPUSupport()
      
      expect(supported).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
      
      // Verify adapter was requested
      expect(navigator.gpu!.requestAdapter).toHaveBeenCalled()
    })

    it('should maintain detection result stability over time', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Detection stability**
      
      // Mock WebGPU available
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      // Property: Detection results should remain stable over multiple calls with delays
      const results: boolean[] = []
      
      for (let i = 0; i < 5; i++) {
        const supported = await aiServiceManager.detectWebGPUSupport()
        results.push(supported)
        
        // Small delay between calls
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // All results should be consistent
      expect(results.every(result => result === true)).toBe(true)
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
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

      // First ensure WebGPU detection fails
      const supported = await aiServiceManager.detectWebGPUSupport()
      expect(supported).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)

      // Property: Model loading should fail when WebGPU is not supported
      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.isModelLoaded.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU')
    })

    it('should allow initialization when WebGPU is supported', async () => {
      // **Feature: client-side-ai-optimization, Property 9: Initialization enablement**
      
      // Mock WebGPU supported
      Object.defineProperty(navigator, 'gpu', {
        value: {
          requestAdapter: vi.fn().mockResolvedValue({})
        },
        configurable: true
      })

      // Property: Initialization should succeed when WebGPU is supported
      await aiServiceManager.initialize()
      
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })
  })
})