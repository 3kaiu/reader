/**
 * TTS延迟加载属性测试
 * 验证TTS延迟加载机制的正确性和一致性
 * 
 * **属性13: TTS延迟加载**
 * **验证: 需求 4.1**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock fetch globally for TTS model downloads
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  status: 200,
  statusText: 'OK'
})

// Mock CDN资源加载器
const mockCdnResourceLoader = {
  loadResource: vi.fn()
}

vi.mock('../utils/cdnResourceLoader', () => ({
  cdnResourceLoader: mockCdnResourceLoader
}))

// Mock 模型缓存管理器
vi.mock('../utils/modelCacheManager', () => ({
  modelCacheManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getCacheStats: vi.fn().mockResolvedValue({ totalSize: 0, modelCount: 0 }),
    isModelCached: vi.fn().mockResolvedValue(false),
    cacheModel: vi.fn().mockResolvedValue(undefined),
    getCachedModel: vi.fn().mockResolvedValue(null)
  }
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock broadcast channel
vi.mock('../utils/broadcast', () => ({
  syncChannel: {
    publish: vi.fn()
  }
}))

describe('TTS Delay Loading Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock Web Audio API
    global.AudioContext = vi.fn().mockImplementation(() => ({
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null
      }),
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      state: 'running'
    }))
    
    ;(global as any).webkitAudioContext = global.AudioContext
    
    // Ensure window object exists with proper methods
    if (typeof global.window === 'undefined') {
      ;(global as any).window = {}
    }
    ;(global.window as any).AudioContext = global.AudioContext
    ;(global.window as any).webkitAudioContext = global.AudioContext
    ;(global.window as any).addEventListener = vi.fn()
    ;(global.window as any).removeEventListener = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 13: TTS Delay Loading Consistency', () => {
    it('should not load TTS library until first use', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Delay loading**
      
      // Import TTS service manager class
      const { TTSServiceManager } = await import('../services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      // Property: TTS library should not be loaded during initialization
      expect(ttsService.isEngineLoaded.value).toBe(false)
      expect(mockCdnResourceLoader.loadResource).not.toHaveBeenCalled()
      
      // Service should be supported but not loaded
      expect(ttsService.isSupported.value).toBe(true)
      expect(ttsService.isLoading.value).toBe(false)
    })

    it('should load TTS library on first speak request', async () => {
      // **Feature: client-side-ai-optimization, Property 13: On-demand loading**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      // Mock successful library loading
      const mockPiperTTS = {
        PiperWebWorkerEngine: vi.fn().mockImplementation(() => ({
          speak: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
          dispose: vi.fn().mockResolvedValue(undefined)
        })),
        OnnxWebGPUWorkerRuntime: vi.fn(),
        HuggingFaceVoiceProvider: vi.fn()
      }
      
      mockCdnResourceLoader.loadResource.mockResolvedValue(mockPiperTTS)
      
      // Property: First speak request should trigger library loading
      await ttsService.speak('Hello world')
      
      // Library should be loaded
      expect(mockCdnResourceLoader.loadResource).toHaveBeenCalledWith('piper-tts-web', expect.any(Object))
      expect(ttsService.isEngineLoaded.value).toBe(true)
    })

    it('should reuse loaded library for subsequent requests', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Library reuse**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      // Mock successful library loading
      const mockEngine = {
        speak: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
        dispose: vi.fn().mockResolvedValue(undefined)
      }
      
      const mockPiperTTS = {
        PiperWebWorkerEngine: vi.fn().mockImplementation(() => mockEngine),
        OnnxWebGPUWorkerRuntime: vi.fn(),
        HuggingFaceVoiceProvider: vi.fn()
      }
      
      mockCdnResourceLoader.loadResource.mockResolvedValue(mockPiperTTS)
      
      // First speak request
      await ttsService.speak('First text')
      const firstCallCount = mockCdnResourceLoader.loadResource.mock.calls.length
      
      // Property: Subsequent requests should reuse the loaded library
      await ttsService.speak('Second text')
      
      // Library should not be loaded again
      expect(mockCdnResourceLoader.loadResource).toHaveBeenCalledTimes(firstCallCount)
      expect(mockEngine.speak).toHaveBeenCalledTimes(2)
    })

    it('should handle loading failures gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Error resilience**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      // Mock loading failure
      mockCdnResourceLoader.loadResource.mockRejectedValue(new Error('Network error'))
      
      // Property: Loading failures should be handled gracefully
      await expect(ttsService.speak('Test text')).rejects.toThrow()
      
      // Error state should be set
      expect(ttsService.error.value).toBeTruthy()
      expect(ttsService.isLoading.value).toBe(false)
      expect(ttsService.isEngineLoaded.value).toBe(false)
    })

    it('should handle Web Audio API unavailability', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Graceful degradation**
      
      // Mock Web Audio API unavailable
      delete (global as any).AudioContext
      delete (global as any).webkitAudioContext
      delete (global.window as any).AudioContext
      delete (global.window as any).webkitAudioContext
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      // Initialize service
      await ttsService.initialize()
      
      // Property: Service should detect unsupported environment
      expect(ttsService.isSupported.value).toBe(false)
      expect(ttsService.error.value).toBeTruthy()
    })

    it('should track loading progress correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Loading progress tracking**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      let progressCallback: ((progress: any) => void) | undefined
      
      // Mock library loading with progress
      mockCdnResourceLoader.loadResource.mockImplementation((resource, options) => {
        progressCallback = options?.onProgress
        
        // Simulate loading progress
        if (progressCallback) {
          progressCallback({ percentage: 0.2, status: 'Loading...' })
          progressCallback({ percentage: 0.5, status: 'Downloading...' })
          progressCallback({ percentage: 1.0, status: 'Complete' })
        }
        
        return Promise.resolve({
          PiperWebWorkerEngine: vi.fn().mockImplementation(() => ({
            speak: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
            dispose: vi.fn().mockResolvedValue(undefined)
          })),
          OnnxWebGPUWorkerRuntime: vi.fn(),
          HuggingFaceVoiceProvider: vi.fn()
        })
      })
      
      // Property: Loading progress should be tracked and updated
      await ttsService.speak('Test text')
      
      // Progress should have been updated
      expect(ttsService.loadProgress.value).toBeGreaterThanOrEqual(80)
      expect(ttsService.loadStatus.value).toBeTruthy()
    })

    it('should clean up resources properly', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Resource cleanup**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const mockEngine = {
        speak: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
        dispose: vi.fn().mockResolvedValue(undefined)
      }
      
      const mockPiperTTS = {
        PiperWebWorkerEngine: vi.fn().mockImplementation(() => mockEngine),
        OnnxWebGPUWorkerRuntime: vi.fn(),
        HuggingFaceVoiceProvider: vi.fn()
      }
      
      mockCdnResourceLoader.loadResource.mockResolvedValue(mockPiperTTS)
      
      // Load engine
      await ttsService.speak('Test text')
      
      // Property: Cleanup should dispose all resources properly
      await ttsService.cleanup()
      
      expect(mockEngine.dispose).toHaveBeenCalled()
      expect(ttsService.isEngineLoaded.value).toBe(false)
    })
  })

  describe('TTS Performance Properties', () => {
    it('should track speech synthesis performance', async () => {
      // **Feature: client-side-ai-optimization, Property 13: Performance monitoring**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const mockEngine = {
        speak: vi.fn().mockImplementation(async () => {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10))
          return new ArrayBuffer(1024)
        }),
        dispose: vi.fn().mockResolvedValue(undefined)
      }
      
      const mockPiperTTS = {
        PiperWebWorkerEngine: vi.fn().mockImplementation(() => mockEngine),
        OnnxWebGPUWorkerRuntime: vi.fn(),
        HuggingFaceVoiceProvider: vi.fn()
      }
      
      mockCdnResourceLoader.loadResource.mockResolvedValue(mockPiperTTS)
      
      const testText = 'This is a test text for performance monitoring'
      
      // Property: Performance metrics should be tracked
      const startTime = Date.now()
      await ttsService.speak(testText)
      
      const performance = ttsService.performance.value
      expect(performance.totalCharacters).toBe(testText.length)
      expect(performance.generationTime).toBeGreaterThan(0)
      expect(performance.charactersPerSecond).toBeGreaterThan(0)
      expect(performance.lastUpdated).toBeGreaterThanOrEqual(startTime)
    })
  })
})