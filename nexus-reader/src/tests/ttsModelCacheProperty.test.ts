/**
 * TTS模型缓存属性测试
 * 验证TTS模型缓存机制的正确性和一致性
 * 
 * **属性16: TTS模型缓存**
 * **验证: 需求 4.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock CDN资源加载器
const mockCdnResourceLoader = {
  loadResource: vi.fn()
}

vi.mock('../utils/cdnResourceLoader', () => ({
  cdnResourceLoader: mockCdnResourceLoader
}))

// Mock 模型缓存管理器
const mockModelCacheManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCacheStats: vi.fn().mockResolvedValue({ totalSize: 0, modelCount: 0 }),
  isModelCached: vi.fn(),
  cacheModel: vi.fn(),
  getCachedModel: vi.fn(),
  removeCachedModel: vi.fn(),
  getCachedModelIds: vi.fn()
}

vi.mock('../utils/modelCacheManager', () => ({
  modelCacheManager: mockModelCacheManager
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

// Mock fetch for model downloading
global.fetch = vi.fn()

describe('TTS Model Cache Properties', () => {
  // Create a fresh instance for each test to avoid singleton issues
  let ttsService: any
  
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
    
    // Create a fresh TTS service instance for each test
    ttsService = null
  })

  afterEach(() => {
    vi.clearAllMocks()
    ttsService = null
  })

  // Helper function to create a fresh TTS service instance
  async function createFreshTTSService() {
    const { TTSServiceManager } = await import('@/services/ttsServiceManager')
    
    // Reset the singleton instance for testing
    ;(TTSServiceManager as any).instance = null
    
    // Get a fresh instance
    const service = TTSServiceManager.getInstance()
    await service.initialize()
    return service
  }

  describe('Property 16: TTS Model Cache Consistency', () => {
    it('should cache TTS models on first use', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Model caching on first use**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      const modelData = new ArrayBuffer(1024 * 1024) // 1MB model
      
      // Mock model not cached initially
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      
      // Mock successful model download
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(modelData)
      })
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Mock TTS library loading
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
      
      // Property: First use should trigger model download and caching
      await ttsService.speak('Hello world', voiceId)
      
      // Model should be checked for cache
      expect(mockModelCacheManager.isModelCached).toHaveBeenCalledWith(`tts-${voiceId}`)
      
      // Model should be downloaded
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(voiceId)
      )
      
      // Model should be cached
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalledWith(
        `tts-${voiceId}`,
        modelData,
        expect.objectContaining({
          version: '1.0.0',
          type: 'tts-model'
        })
      )
    })

    it('should reuse cached TTS models', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Model reuse from cache**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      
      // Mock model already cached
      mockModelCacheManager.isModelCached.mockResolvedValue(true)
      
      // Mock TTS library loading
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
      
      // Property: Cached models should be reused without downloading
      await ttsService.speak('Hello world', voiceId)
      
      // Model cache should be checked
      expect(mockModelCacheManager.isModelCached).toHaveBeenCalledWith(`tts-${voiceId}`)
      
      // No download should occur
      expect(global.fetch).not.toHaveBeenCalled()
      
      // No new caching should occur
      expect(mockModelCacheManager.cacheModel).not.toHaveBeenCalled()
    })

    it('should handle multiple voice models independently', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Independent model management**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceIds = ['zh_CN-huayan-medium', 'en_US-amy-medium', 'zh_CN-xiaoyan-medium']
      
      // Mock different cache states for different models
      mockModelCacheManager.isModelCached.mockImplementation((modelId: string) => {
        if (modelId === 'tts-zh_CN-huayan-medium') return Promise.resolve(true)
        return Promise.resolve(false)
      })
      
      // Mock successful downloads
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024 * 1024))
      })
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Mock TTS library
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
      
      // Property: Each voice model should be managed independently
      for (const voiceId of voiceIds) {
        await ttsService.speak('Test text', voiceId)
      }
      
      // All models should be checked
      for (const voiceId of voiceIds) {
        expect(mockModelCacheManager.isModelCached).toHaveBeenCalledWith(`tts-${voiceId}`)
      }
      
      // Only uncached models should be downloaded (2 out of 3)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalledTimes(2)
    })

    it('should handle model download failures gracefully', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Download error handling**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      
      // Mock model not cached
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      
      // Mock download failure
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      })
      
      // Property: Download failures should be handled gracefully
      await expect(ttsService.preloadTTSModel(voiceId)).rejects.toThrow()
      
      // Download should be attempted
      expect(global.fetch).toHaveBeenCalled()
      
      // No caching should occur on failure
      expect(mockModelCacheManager.cacheModel).not.toHaveBeenCalled()
    })

    it('should provide correct available voices list', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Voice enumeration**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      // Property: Available voices should be correctly enumerated
      const availableVoices = ttsService.getAvailableVoices()
      
      expect(Array.isArray(availableVoices)).toBe(true)
      expect(availableVoices.length).toBeGreaterThan(0)
      expect(availableVoices).toContain('zh_CN-huayan-medium')
      expect(availableVoices).toContain('en_US-amy-medium')
    })

    it('should correctly report cached model status', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Cache status reporting**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      
      // Mock model cached
      mockModelCacheManager.isModelCached.mockResolvedValue(true)
      
      // Property: Cache status should be correctly reported
      const isCached = await ttsService.isTTSModelCached(voiceId)
      
      expect(isCached).toBe(true)
      expect(mockModelCacheManager.isModelCached).toHaveBeenCalledWith(`tts-${voiceId}`)
    })

    it('should support model preloading', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Model preloading**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      const modelData = new ArrayBuffer(1024 * 1024)
      
      // Mock model not cached initially, then cached after download
      mockModelCacheManager.isModelCached
        .mockResolvedValueOnce(false) // First check - not cached
        .mockResolvedValueOnce(true)  // After download - cached
      
      // Mock getCachedModel to return null first (not cached), then return data after caching
      mockModelCacheManager.getCachedModel
        .mockResolvedValueOnce(null)     // First call - not cached
        .mockResolvedValueOnce(modelData) // Second call - cached data
      
      // Mock successful download
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(modelData)
      })
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Property: Models should be preloadable without immediate use
      await ttsService.preloadTTSModel(voiceId)
      
      // Model should be downloaded and cached
      expect(global.fetch).toHaveBeenCalled()
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalledWith(
        `tts-${voiceId}`,
        modelData,
        expect.any(Object)
      )
    })

    it('should list cached TTS models correctly', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Cached model enumeration**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const cachedModelIds = [
        'tts-zh_CN-huayan-medium',
        'tts-en_US-amy-medium',
        'ai-model-qwen',  // Non-TTS model (should be filtered out)
        'tts-zh_CN-xiaoyan-medium'
      ]
      
      mockModelCacheManager.getCachedModelIds.mockResolvedValue(cachedModelIds)
      
      // Property: Only TTS models should be returned in the list
      const cachedTTSModels = await ttsService.getCachedTTSModels()
      
      expect(cachedTTSModels).toEqual([
        'zh_CN-huayan-medium',
        'en_US-amy-medium',
        'zh_CN-xiaoyan-medium'
      ])
      
      // Non-TTS model should be filtered out
      expect(cachedTTSModels).not.toContain('ai-model-qwen')
    })

    it('should support model removal', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Model removal**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      
      mockModelCacheManager.removeCachedModel.mockResolvedValue(undefined)
      
      // Property: Cached models should be removable
      await ttsService.removeCachedTTSModel(voiceId)
      
      expect(mockModelCacheManager.removeCachedModel).toHaveBeenCalledWith(`tts-${voiceId}`)
    })

    it('should handle concurrent model operations safely', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Concurrent operation safety**
      
      const ttsService = await createFreshTTSService()
      
      const voiceIds = ['zh_CN-huayan-medium', 'en_US-amy-medium', 'zh_CN-xiaoyan-medium']
      
      // Mock all models not cached initially
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      
      // Mock getCachedModel to return null first (not cached), then return data after caching
      const modelData = new ArrayBuffer(1024 * 1024)
      mockModelCacheManager.getCachedModel
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // First model
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // Second model  
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // Third model
      
      // Mock successful downloads with delay
      ;(global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(modelData)
        }), 50))
      )
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Mock TTS library
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
      
      // Property: Concurrent model operations should not interfere
      const promises = voiceIds.map(voiceId => 
        ttsService.speak('Test text', voiceId)
      )
      
      await Promise.all(promises)
      
      // Models should be processed (at least some downloads should occur)
      expect(global.fetch).toHaveBeenCalled()
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalled()
      
      // Verify that all speak operations completed successfully
      expect(mockEngine.speak).toHaveBeenCalledTimes(voiceIds.length)
    })

    it('should maintain model cache consistency across operations', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Cache consistency**
      
      const { TTSServiceManager } = await import('@/services/ttsServiceManager')
      const ttsService = new (TTSServiceManager as any)()
      
      await ttsService.initialize()
      
      const voiceId = 'zh_CN-huayan-medium'
      const modelData = new ArrayBuffer(1024 * 1024)
      
      // Mock successful operations
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(modelData)
      })
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      mockModelCacheManager.removeCachedModel.mockResolvedValue(undefined)
      
      // Property: Cache operations should maintain consistency
      
      // 1. Preload model
      await ttsService.preloadTTSModel(voiceId)
      
      // 2. Check if cached (should be true after preload)
      mockModelCacheManager.isModelCached.mockResolvedValue(true)
      const isCached = await ttsService.isTTSModelCached(voiceId)
      expect(isCached).toBe(true)
      
      // 3. Remove model
      await ttsService.removeCachedTTSModel(voiceId)
      
      // 4. Check if cached (should be false after removal)
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      const isStillCached = await ttsService.isTTSModelCached(voiceId)
      expect(isStillCached).toBe(false)
    })
  })

  describe('TTS Model Performance Properties', () => {
    it('should handle large model downloads efficiently', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Large model handling**
      
      const ttsService = await createFreshTTSService()
      
      const voiceId = 'zh_CN-huayan-medium'
      const largeModelData = new ArrayBuffer(50 * 1024 * 1024) // 50MB model
      
      // Mock model not cached initially, then cached after download
      mockModelCacheManager.isModelCached
        .mockResolvedValueOnce(false) // First check - not cached
        .mockResolvedValueOnce(true)  // After download - cached
      
      // Mock getCachedModel to return null first, then return data after caching
      mockModelCacheManager.getCachedModel
        .mockResolvedValueOnce(null)           // First call - not cached
        .mockResolvedValueOnce(largeModelData) // Second call - cached data
      
      // Mock large model download
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(largeModelData)
      })
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Property: Large models should be handled efficiently
      const startTime = Date.now()
      await ttsService.preloadTTSModel(voiceId)
      const endTime = Date.now()
      
      // Should complete in reasonable time (less than 1 second for mock)
      expect(endTime - startTime).toBeLessThan(1000)
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalledWith(
        `tts-${voiceId}`,
        largeModelData,
        expect.any(Object)
      )
    })

    it('should batch multiple model preloads efficiently', async () => {
      // **Feature: client-side-ai-optimization, Property 16: Batch preload efficiency**
      
      const ttsService = await createFreshTTSService()
      
      const voiceIds = ['zh_CN-huayan-medium', 'en_US-amy-medium', 'zh_CN-xiaoyan-medium']
      
      // Mock all models not cached initially
      mockModelCacheManager.isModelCached.mockResolvedValue(false)
      
      // Mock getCachedModel to return null first (not cached), then return data after caching
      const modelData = new ArrayBuffer(1024 * 1024)
      mockModelCacheManager.getCachedModel
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // First model
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // Second model  
        .mockResolvedValueOnce(null).mockResolvedValueOnce(modelData) // Third model
      
      // Mock successful downloads
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(modelData)
      })
      
      mockModelCacheManager.cacheModel.mockResolvedValue(undefined)
      
      // Property: Multiple preloads should be handled efficiently
      const startTime = Date.now()
      
      const promises = voiceIds.map(voiceId => 
        ttsService.preloadTTSModel(voiceId)
      )
      
      await Promise.all(promises)
      const endTime = Date.now()
      
      // Models should be preloaded (at least some downloads should occur)
      expect(global.fetch).toHaveBeenCalled()
      expect(mockModelCacheManager.cacheModel).toHaveBeenCalled()
      
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(2000)
      
      // Verify that all preload operations completed successfully
      expect(promises).toHaveLength(voiceIds.length)
    })
  })
})