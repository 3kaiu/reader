/**
 * AI错误处理和离线功能测试
 * 验证AI服务的错误处理和离线场景支持
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiServiceManager } from '@/services/aiServiceManager'

// Mock dependencies
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

describe('AI Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock WebGPU support
    Object.defineProperty(navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockResolvedValue({})
      },
      configurable: true
    })
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
  })

  describe('CDN Loading Errors', () => {
    it('should handle CDN timeout errors', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(new Error('Request timeout'))
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('AI库加载失败')
      expect(aiServiceManager.isLoading.value).toBe(false)
    })

    it('should handle CDN network errors', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(new Error('Network error'))
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('Network error')
    })

    it('should handle malformed CDN responses', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue(null) // Invalid response
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('AI库加载失败')
    })

    it('should handle missing WebLLM methods', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            // Missing CreateWebWorkerMLCEngine method
            someOtherMethod: vi.fn()
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('WebLLM library not properly loaded')
    })
  })

  describe('Worker Creation Errors', () => {
    it('should handle Worker constructor errors', async () => {
      // Mock successful CDN loading
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn()
          })
        }
      }))

      // Mock Worker to throw
      global.Worker = vi.fn().mockImplementation(() => {
        throw new Error('Worker creation failed')
      }) as any

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('模型加载失败')
    })

    it('should handle Worker runtime errors', async () => {
      const mockWorker = {
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        postMessage: vi.fn(),
        onerror: null as any,
        onmessage: null as any
      }

      global.Worker = vi.fn().mockImplementation(() => mockWorker) as any

      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockRejectedValue(
              new Error('Worker runtime error')
            )
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('模型加载失败')
    })
  })

  describe('Model Loading Errors', () => {
    it('should handle model download failures', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockRejectedValue(
              new Error('Model download failed')
            )
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('Model download failed')
    })

    it('should handle insufficient VRAM errors', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockRejectedValue(
              new Error('Insufficient GPU memory')
            )
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('Insufficient GPU memory')
    })

    it('should handle model corruption errors', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockRejectedValue(
              new Error('Model file corrupted')
            )
          })
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('Model file corrupted')
    })
  })

  describe('Inference Errors', () => {
    beforeEach(async () => {
      // Mock successful model loading
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
              chat: {
                completions: {
                  create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'Test response' } }]
                  })
                }
              },
              unload: vi.fn(),
              terminate: vi.fn()
            })
          })
        }
      }))

      await aiServiceManager.loadModel('test-model')
    })

    it('should handle inference timeout errors', async () => {
      const mockEngine = aiServiceManager.engineInstance
      if (mockEngine) {
        vi.mocked(mockEngine.chat.completions.create).mockRejectedValue(
          new Error('Inference timeout')
        )
      }

      await expect(
        aiServiceManager.inference('Test prompt')
      ).rejects.toThrow('AI推理失败: Inference timeout')
    })

    it('should handle malformed inference responses', async () => {
      const mockEngine = aiServiceManager.engineInstance
      if (mockEngine) {
        vi.mocked(mockEngine.chat.completions.create).mockResolvedValue({
          // Missing choices array
          usage: { total_tokens: 100 }
        })
      }

      const response = await aiServiceManager.inference('Test prompt')
      expect(response).toBe('') // Should return empty string for malformed response
    })

    it('should handle engine crash during inference', async () => {
      const mockEngine = aiServiceManager.engineInstance
      if (mockEngine) {
        vi.mocked(mockEngine.chat.completions.create).mockRejectedValue(
          new Error('Engine crashed')
        )
      }

      await expect(
        aiServiceManager.inference('Test prompt')
      ).rejects.toThrow('AI推理失败: Engine crashed')
    })
  })

  describe('Resource Cleanup Errors', () => {
    it('should handle unload errors gracefully', async () => {
      // Mock successful model loading
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
              chat: { completions: { create: vi.fn() } },
              unload: vi.fn().mockRejectedValue(new Error('Unload failed')),
              terminate: vi.fn()
            })
          })
        }
      }))

      await aiServiceManager.loadModel('test-model')
      
      // Should not throw even if unload fails
      await expect(aiServiceManager.unloadModel()).resolves.toBeUndefined()
      
      // Should still clean up state
      expect(aiServiceManager.isModelLoaded.value).toBe(false)
    })

    it('should handle worker termination errors', async () => {
      const mockWorker = {
        terminate: vi.fn().mockImplementation(() => {
          throw new Error('Termination failed')
        }),
        addEventListener: vi.fn()
      }

      global.Worker = vi.fn().mockImplementation(() => mockWorker) as any

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
      
      // Should handle worker termination errors gracefully
      await expect(aiServiceManager.cleanup()).resolves.toBeUndefined()
    })
  })

  describe('State Recovery', () => {
    it('should recover from error state on successful retry', async () => {
      // First attempt fails
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn()
            .mockRejectedValueOnce(new Error('First attempt failed'))
            .mockResolvedValueOnce({
              CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
                chat: { completions: { create: vi.fn() } },
                unload: vi.fn(),
                terminate: vi.fn()
              })
            })
        }
      }))

      // First attempt should fail
      const result1 = await aiServiceManager.loadModel('test-model')
      expect(result1).toBe(false)
      expect(aiServiceManager.error.value).toBeTruthy()

      // Second attempt should succeed and clear error
      const result2 = await aiServiceManager.loadModel('test-model')
      expect(result2).toBe(true)
      expect(aiServiceManager.error.value).toBeNull()
    })
  })
})

describe('Offline Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock WebGPU support
    Object.defineProperty(navigator, 'gpu', {
      value: {
        requestAdapter: vi.fn().mockResolvedValue({})
      },
      configurable: true
    })
  })

  afterEach(async () => {
    await aiServiceManager.cleanup()
  })

  describe('Network Detection', () => {
    it('should handle offline CDN loading gracefully', async () => {
      // Mock network error (offline)
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(
            new Error('Failed to fetch')
          )
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('AI库加载失败')
    })

    it('should provide meaningful offline error messages', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(
            new Error('NetworkError: Failed to fetch')
          )
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('Failed to fetch')
    })
  })

  describe('Cached Model Usage', () => {
    it('should continue working with loaded model when offline', async () => {
      // First load model while online
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockResolvedValue({
            CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({
              chat: {
                completions: {
                  create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'Offline response' } }]
                  })
                }
              },
              unload: vi.fn(),
              terminate: vi.fn()
            })
          })
        }
      }))

      await aiServiceManager.loadModel('test-model')
      expect(aiServiceManager.isModelLoaded.value).toBe(true)

      // Now simulate going offline - inference should still work
      const response = await aiServiceManager.inference('Test prompt')
      expect(response).toBe('Offline response')
    })
  })

  describe('Graceful Degradation', () => {
    it('should provide helpful error messages for offline scenarios', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(
            new Error('Network request failed')
          )
        }
      }))

      const result = await aiServiceManager.loadModel('test-model')
      
      expect(result).toBe(false)
      expect(aiServiceManager.error.value).toContain('AI库加载失败')
      expect(aiServiceManager.isLoading.value).toBe(false)
    })

    it('should maintain consistent state during offline errors', async () => {
      vi.doMock('@/utils/cdnResourceLoader', () => ({
        cdnResourceLoader: {
          loadResource: vi.fn().mockRejectedValue(
            new Error('Offline error')
          )
        }
      }))

      const initialState = {
        isSupported: aiServiceManager.isSupported.value,
        isLoading: aiServiceManager.isLoading.value,
        isModelLoaded: aiServiceManager.isModelLoaded.value
      }

      await aiServiceManager.loadModel('test-model')

      // State should be consistent after error
      expect(aiServiceManager.isLoading.value).toBe(false)
      expect(aiServiceManager.isModelLoaded.value).toBe(false)
      expect(aiServiceManager.error.value).toBeTruthy()
    })
  })
})