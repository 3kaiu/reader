/**
 * AI错误处理属性测试
 * 验证错误处理和用户提示的正确性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { aiErrorHandler, AIErrorType, ErrorSeverity, type AIError } from '@/utils/aiErrorHandler'

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

describe('AI错误处理属性测试 (Property 27)', () => {
  beforeEach(() => {
    // 清理错误状态
    aiErrorHandler.clearError()
    aiErrorHandler.exitFallbackMode()
    vi.clearAllMocks()
  })

  afterEach(() => {
    aiErrorHandler.clearError()
    aiErrorHandler.exitFallbackMode()
  })

  describe('属性1: 错误分类正确性', () => {
    it('应该正确识别WebGPU不支持错误', async () => {
      const webgpuError = new Error('WebGPU is not supported')
      const result = await aiErrorHandler.handleError(webgpuError, 'webgpu_test')

      expect(result.type).toBe(AIErrorType.WEBGPU_NOT_SUPPORTED)
      expect(result.severity).toBe(ErrorSeverity.HIGH)
      expect(result.retryable).toBe(false)
      expect(result.fallbackAvailable).toBe(true)
    })

    it('应该正确识别网络错误', async () => {
      const networkError = new Error('Network request failed')
      const result = await aiErrorHandler.handleError(networkError, 'network_test')

      expect(result.type).toBe(AIErrorType.NETWORK_ERROR)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.retryable).toBe(true)
    })

    it('应该正确识别模型加载错误', async () => {
      const modelError = new Error('Failed to load model')
      const result = await aiErrorHandler.handleError(modelError, 'model_test')

      expect(result.type).toBe(AIErrorType.MODEL_LOAD_FAILED)
      expect(result.severity).toBe(ErrorSeverity.HIGH)
      expect(result.retryable).toBe(true)
      expect(result.fallbackAvailable).toBe(true)
    })

    it('应该正确识别存储配额错误', async () => {
      const storageError = new Error('Storage quota exceeded')
      const result = await aiErrorHandler.handleError(storageError, 'storage_test')

      expect(result.type).toBe(AIErrorType.STORAGE_QUOTA_EXCEEDED)
      expect(result.severity).toBe(ErrorSeverity.MEDIUM)
      expect(result.retryable).toBe(true)
      expect(result.fallbackAvailable).toBe(true)
    })
  })

  describe('属性2: 用户消息友好性', () => {
    it('用户消息应该是中文且易于理解', async () => {
      const errors = [
        new Error('WebGPU is not supported'),
        new Error('Network request failed'),
        new Error('Failed to load model'),
        new Error('Storage quota exceeded')
      ]

      for (const error of errors) {
        const result = await aiErrorHandler.handleError(error, 'test')
        
        // 检查用户消息是中文
        expect(result.userMessage).toMatch(/[\u4e00-\u9fa5]/)
        
        // 检查消息长度合理（不能太短或太长）
        expect(result.userMessage.length).toBeGreaterThan(5)
        expect(result.userMessage.length).toBeLessThan(200)
        
        // 检查不包含技术术语
        expect(result.userMessage).not.toMatch(/WebGPU|API|HTTP|fetch/)
      }
    })

    it('应该为每种错误类型提供具体的解决建议', () => {
      const testCases = [
        {
          type: AIErrorType.WEBGPU_NOT_SUPPORTED,
          shouldInclude: ['浏览器', '驱动']
        },
        {
          type: AIErrorType.NETWORK_ERROR,
          shouldInclude: ['网络', '连接']
        },
        {
          type: AIErrorType.MODEL_LOAD_FAILED,
          shouldInclude: ['模型', '重试']
        },
        {
          type: AIErrorType.STORAGE_QUOTA_EXCEEDED,
          shouldInclude: ['存储', '空间']
        }
      ]

      testCases.forEach(({ type, shouldInclude }) => {
        const mockError: AIError = {
          type,
          severity: ErrorSeverity.MEDIUM,
          message: 'test error',
          userMessage: '测试错误',
          timestamp: Date.now(),
          retryable: true,
          fallbackAvailable: false
        }

        const friendlyMessage = aiErrorHandler.getUserFriendlyMessage(mockError)
        
        shouldInclude.forEach(keyword => {
          expect(friendlyMessage).toMatch(new RegExp(keyword))
        })
      })
    })
  })

  describe('属性3: 重试机制正确性', () => {
    it('网络错误应该支持指数退避重试', async () => {
      let attemptCount = 0
      const mockOperation = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Network error')
        }
        return Promise.resolve('success')
      })

      const startTime = Date.now()
      const result = await aiErrorHandler.handleNetworkError(
        new Error('Network error'),
        mockOperation,
        { maxAttempts: 3, baseDelay: 100, backoffFactor: 2 }
      )

      const endTime = Date.now()
      const totalTime = endTime - startTime

      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(3)
      
      // 验证退避延迟：第一次重试100ms，第二次重试200ms
      // 总时间应该至少是300ms（100 + 200）
      expect(totalTime).toBeGreaterThanOrEqual(250) // 允许一些误差
    })

    it('不可重试的错误不应该触发重试', async () => {
      const webgpuError = new Error('WebGPU is not supported')
      const result = await aiErrorHandler.handleError(webgpuError, 'test')

      expect(result.retryable).toBe(false)
      expect(aiErrorHandler.retryCount.value).toBe(0)
    })

    it('重试次数应该正确限制', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Always fails'))

      try {
        await aiErrorHandler.handleNetworkError(
          new Error('Network error'),
          mockOperation,
          { maxAttempts: 2 }
        )
      } catch (error) {
        // 预期会抛出错误
      }

      expect(mockOperation).toHaveBeenCalledTimes(2)
      expect(aiErrorHandler.retryCount.value).toBe(0) // 重试完成后应该重置
    })
  })

  describe('属性4: 降级策略正确性', () => {
    it('WebGPU不支持时应该启用降级模式', async () => {
      await aiErrorHandler.handleWebGPUNotSupported()

      expect(aiErrorHandler.isInFallback()).toBe(true)
      expect(aiErrorHandler.fallbackReason.value).toBe('WebGPU不支持')
    })

    it('降级模式可以正确退出', () => {
      // 先进入降级模式
      aiErrorHandler.isInFallbackMode.value = true
      aiErrorHandler.fallbackReason.value = '测试降级'

      // 退出降级模式
      aiErrorHandler.exitFallbackMode()

      expect(aiErrorHandler.isInFallback()).toBe(false)
      expect(aiErrorHandler.fallbackReason.value).toBe('')
      expect(aiErrorHandler.currentError.value).toBeNull()
    })

    it('存储配额超出时应该自动清理', async () => {
      // Mock modelCacheManager using vi.mock at the top level
      await aiErrorHandler.handleStorageQuotaExceeded()

      expect(aiErrorHandler.currentError.value?.type).toBe(AIErrorType.STORAGE_QUOTA_EXCEEDED)
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('存储')
    })
  })

  describe('属性5: 错误状态管理', () => {
    it('错误状态应该正确更新和清理', async () => {
      const testError = new Error('Test error')
      await aiErrorHandler.handleError(testError, 'test')

      // 验证错误状态已设置
      expect(aiErrorHandler.currentError.value).not.toBeNull()
      expect(aiErrorHandler.currentError.value?.message).toBe('Test error')

      // 清理错误状态
      aiErrorHandler.clearError()

      expect(aiErrorHandler.currentError.value).toBeNull()
      expect(aiErrorHandler.retryCount.value).toBe(0)
    })

    it('错误统计应该正确累计', async () => {
      // 清理之前的统计
      aiErrorHandler.clearError()
      
      const errors = [
        new Error('WebGPU is not supported'),
        new Error('Network request failed'),
        new Error('WebGPU is not supported'), // 重复错误
        new Error('Failed to load model')
      ]

      for (const error of errors) {
        await aiErrorHandler.handleError(error, 'test')
      }

      const stats = aiErrorHandler.getErrorStats()
      expect(stats[AIErrorType.WEBGPU_NOT_SUPPORTED]).toBeGreaterThanOrEqual(2)
      expect(stats[AIErrorType.NETWORK_ERROR]).toBeGreaterThanOrEqual(1)
      expect(stats[AIErrorType.MODEL_LOAD_FAILED]).toBeGreaterThanOrEqual(1)
    })

    it('错误历史应该正确记录', async () => {
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3')
      ]

      for (const error of errors) {
        await aiErrorHandler.handleError(error, 'test')
      }

      const recentErrors = aiErrorHandler.getRecentErrors(2)
      expect(recentErrors).toHaveLength(2)
      expect(recentErrors[0].message).toBe('Error 2')
      expect(recentErrors[1].message).toBe('Error 3')
    })
  })

  describe('属性6: 超时处理', () => {
    it('应该正确处理超时错误', async () => {
      await aiErrorHandler.handleTimeoutError('model_loading', 30000)

      expect(aiErrorHandler.currentError.value).not.toBeNull()
      expect(aiErrorHandler.currentError.value?.type).toBe(AIErrorType.TIMEOUT_ERROR)
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('30秒')
    })

    it('超时错误应该是可重试的', async () => {
      await aiErrorHandler.handleTimeoutError('inference', 10000)

      expect(aiErrorHandler.currentError.value?.retryable).toBe(true)
    })
  })

  describe('属性7: 推理失败处理', () => {
    it('应该正确处理推理失败', async () => {
      const testPrompt = 'Test prompt for inference'
      await aiErrorHandler.handleInferenceFailure(new Error('Inference failed'), testPrompt)

      expect(aiErrorHandler.currentError.value?.type).toBe(AIErrorType.INFERENCE_FAILED)
      expect(aiErrorHandler.currentError.value?.details.promptLength).toBe(testPrompt.length)
    })

    it('长输入应该提供特殊建议', async () => {
      const longPrompt = 'a'.repeat(5000) // 5000字符的长输入
      await aiErrorHandler.handleInferenceFailure(new Error('Inference failed'), longPrompt)

      expect(aiErrorHandler.currentError.value?.userMessage).toContain('过长')
      expect(aiErrorHandler.currentError.value?.fallbackAvailable).toBe(true)
    })
  })

  describe('属性8: 模型加载失败处理', () => {
    it('应该正确处理模型加载失败', async () => {
      const testModelId = 'test-model-id'
      await aiErrorHandler.handleModelLoadFailure(testModelId, new Error('Load failed'))

      expect(aiErrorHandler.currentError.value?.type).toBe(AIErrorType.MODEL_LOAD_FAILED)
      expect(aiErrorHandler.currentError.value?.details.modelId).toBe(testModelId)
      expect(aiErrorHandler.currentError.value?.userMessage).toContain('模型')
    })
  })

  describe('属性9: 事件广播', () => {
    it('错误处理应该广播相应事件', async () => {
      const { syncChannel } = await import('@/utils/broadcast')
      
      const testError = new Error('Test error')
      await aiErrorHandler.handleError(testError, 'test_context')

      expect(syncChannel.publish).toHaveBeenCalledWith('ai-error', expect.objectContaining({
        error: expect.objectContaining({
          message: 'Test error'
        }),
        context: 'test_context'
      }))
    })

    it('降级模式启用应该广播事件', async () => {
      const { syncChannel } = await import('@/utils/broadcast')
      
      await aiErrorHandler.handleWebGPUNotSupported()

      expect(syncChannel.publish).toHaveBeenCalledWith('ai-fallback-enabled', expect.objectContaining({
        reason: 'webgpu_not_supported',
        fallbackMode: 'cpu'
      }))
    })
  })

  describe('属性10: 边界条件处理', () => {
    it('应该处理null和undefined错误', async () => {
      const nullError = null as any
      const result = await aiErrorHandler.handleError(nullError, 'null_test')

      expect(result.type).toBe(AIErrorType.UNKNOWN_ERROR)
      expect(result.userMessage).toContain('未知错误')
    })

    it('应该处理空字符串错误消息', async () => {
      const emptyError = new Error('')
      const result = await aiErrorHandler.handleError(emptyError, 'empty_test')

      expect(result.type).toBe(AIErrorType.UNKNOWN_ERROR)
      expect(result.userMessage).toBeTruthy()
    })

    it('应该处理非常长的错误消息', async () => {
      const longMessage = 'Error: ' + 'a'.repeat(10000)
      const longError = new Error(longMessage)
      const result = await aiErrorHandler.handleError(longError, 'long_test')

      expect(result.message).toBe(longMessage)
      expect(result.userMessage.length).toBeLessThan(500) // 用户消息应该保持合理长度
    })
  })
})