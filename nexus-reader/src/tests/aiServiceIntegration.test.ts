/**
 * AI服务集成测试
 * 验证AIServiceManager与现有AI stores的集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiServiceManager } from '@/services/aiServiceManager'
import { useAIService } from '@/stores/ai/serviceStore'

// Mock dependencies
vi.mock('@/utils/cdnResourceLoader', () => ({
  cdnResourceLoader: {
    loadResource: vi.fn().mockResolvedValue({
      CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Test response' } }],
              usage: { total_tokens: 100 }
            })
          }
        },
        unload: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn().mockResolvedValue(undefined)
      })
    })
  }
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/utils/broadcast', () => ({
  syncChannel: {
    publish: vi.fn()
  }
}))

vi.mock('@/stores/ai/models', () => ({
  getDefaultModel: vi.fn().mockReturnValue('test-model'),
  saveLastModel: vi.fn(),
  getAllModels: vi.fn().mockReturnValue([
    {
      id: 'test-model',
      name: 'Test Model',
      fullName: 'Test Model Full',
      vendor: 'Test Vendor',
      size: '1GB',
      params: '1B',
      quantization: 'Q4',
      description: 'Test model',
      recommended: true,
      contextWindow: 2048,
      series: 'test'
    }
  ])
}))

// Mock WebGPU
Object.defineProperty(navigator, 'gpu', {
  value: {
    requestAdapter: vi.fn().mockResolvedValue({})
  },
  configurable: true
})

// Mock Worker
global.Worker = vi.fn().mockImplementation(() => ({
  terminate: vi.fn(),
  addEventListener: vi.fn()
})) as any

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
global.URL.revokeObjectURL = vi.fn()

describe('AI Service Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
  })

  describe('Service Manager Initialization', () => {
    it('should initialize successfully with WebGPU support', async () => {
      await aiServiceManager.initialize()
      
      expect(aiServiceManager.isSupported.value).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })

    it('should handle WebGPU not supported', async () => {
      // Mock WebGPU not available
      Object.defineProperty(navigator, 'gpu', {
        value: undefined,
        configurable: true
      })

      await aiServiceManager.initialize()
      
      expect(aiServiceManager.isSupported.value).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebGPU')
    })
  })

  describe('Model Loading', () => {
    it('should load model successfully', async () => {
      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(true)
      expect(aiServiceManager.isModelLoaded.value).toBe(true)
      expect(aiServiceManager.currentModel.value).toBe('test-model')
      expect(aiServiceManager.loadProgress.value).toBe(100)
    })

    it('should prevent concurrent model loading', async () => {
      const promise1 = aiServiceManager.loadModel('test-model-1')
      const promise2 = aiServiceManager.loadModel('test-model-2')
      
      const [result1, result2] = await Promise.all([promise1, promise2])
      
      // Only one should succeed
      expect(result1 || result2).toBe(true)
      expect(result1 && result2).toBe(false)
    })
  })

  describe('AI Inference', () => {
    beforeEach(async () => {
      await aiServiceManager.loadModel('test-model')
    })

    it('should perform inference successfully', async () => {
      const response = await aiServiceManager.inference('Test prompt')
      
      expect(response).toBe('Test response')
      expect(aiServiceManager.performance.value.totalTokens).toBe(100)
      expect(aiServiceManager.performance.value.generationTime).toBeGreaterThan(0)
    })

    it('should handle inference with custom parameters', async () => {
      const response = await aiServiceManager.inference('Test prompt', {
        temperature: 0.5,
        max_tokens: 1024
      })
      
      expect(response).toBe('Test response')
    })

    it('should throw error when engine not ready', async () => {
      await aiServiceManager.unloadModel()
      
      await expect(
        aiServiceManager.inference('Test prompt')
      ).rejects.toThrow('AI引擎未就绪')
    })
  })

  describe('Store Integration', () => {
    it('should provide reactive state through useAIService', () => {
      const aiService = useAIService()
      
      expect(aiService.isSupported).toBeDefined()
      expect(aiService.isLoading).toBeDefined()
      expect(aiService.isModelLoaded).toBeDefined()
      expect(aiService.loadProgress).toBeDefined()
      expect(aiService.loadStatus).toBeDefined()
      expect(aiService.error).toBeDefined()
      expect(aiService.currentModel).toBeDefined()
      expect(aiService.performance).toBeDefined()
    })

    it('should provide all necessary methods', () => {
      const aiService = useAIService()
      
      expect(typeof aiService.initialize).toBe('function')
      expect(typeof aiService.checkSupport).toBe('function')
      expect(typeof aiService.loadModel).toBe('function')
      expect(typeof aiService.unloadModel).toBe('function')
      expect(typeof aiService.inference).toBe('function')
      expect(typeof aiService.isReady).toBe('function')
      expect(typeof aiService.getRecommendedModels).toBe('function')
      expect(typeof aiService.getAllModels).toBe('function')
      expect(typeof aiService.cleanup).toBe('function')
    })
  })

  describe('Model Management', () => {
    it('should get recommended models', () => {
      const models = aiServiceManager.getRecommendedModels()
      expect(Array.isArray(models)).toBe(true)
    })

    it('should get all models', () => {
      const models = aiServiceManager.getAllModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)
      expect(models[0]).toHaveProperty('id')
      expect(models[0]).toHaveProperty('name')
      expect(models[0]).toHaveProperty('recommended')
    })

    it('should unload model properly', async () => {
      await aiServiceManager.loadModel('test-model')
      expect(aiServiceManager.isModelLoaded.value).toBe(true)
      
      await aiServiceManager.unloadModel()
      expect(aiServiceManager.isModelLoaded.value).toBe(false)
      expect(aiServiceManager.currentModel.value).toBeNull()
    })
  })

  describe('Auto-unload Timer', () => {
    it('should reset timer on inference', async () => {
      await aiServiceManager.loadModel('test-model')
      
      // Perform inference to reset timer
      await aiServiceManager.inference('Test prompt')
      
      // Timer should be active (we can't easily test the actual timeout)
      expect(aiServiceManager.isModelLoaded.value).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle CDN loading errors', async () => {
      const { cdnResourceLoader } = await import('@/utils/cdnResourceLoader')
      vi.mocked(cdnResourceLoader.loadResource).mockRejectedValueOnce(
        new Error('CDN load failed')
      )

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('AI库加载失败')
    })

    it('should handle worker creation errors', async () => {
      // Mock Worker constructor to throw
      global.Worker = vi.fn().mockImplementation(() => {
        throw new Error('Worker creation failed')
      }) as any

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('模型加载失败')
    })
  })

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await aiServiceManager.loadModel('test-model')
    })

    it('should track performance metrics', async () => {
      await aiServiceManager.inference('Test prompt')
      
      const perf = aiServiceManager.performance.value
      expect(perf.totalTokens).toBe(100)
      expect(perf.generationTime).toBeGreaterThan(0)
      expect(perf.tokensPerSecond).toBeGreaterThan(0)
      expect(perf.lastUpdated).toBeGreaterThan(0)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup all resources', async () => {
      await aiServiceManager.loadModel('test-model')
      expect(aiServiceManager.isModelLoaded.value).toBe(true)
      
      await aiServiceManager.cleanup()
      
      expect(aiServiceManager.isModelLoaded.value).toBe(false)
      expect(aiServiceManager.currentModel.value).toBeNull()
    })
  })
})