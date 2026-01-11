/**
 * 简化的超时重试机制测试
 * 验证核心功能的正确性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock window and navigator
Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn()
  }
})

Object.defineProperty(globalThis, 'navigator', {
  value: {
    onLine: true,
    connection: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50
    }
  }
})

// Mock dependencies
vi.mock('@/utils/performanceMonitor', () => ({
  performanceMonitor: {
    reportMetric: vi.fn()
  }
}))

vi.mock('@/utils/aiErrorHandler', () => ({
  aiErrorHandler: {
    handleError: vi.fn((error) => Promise.resolve(error))
  }
}))

import { 
  aiTimeoutRetryManager, 
  type AIOperationType,
  calculateBackoffDelay,
  isRetryableError,
  createTimeoutPromise
} from '@/utils/aiTimeoutRetryManager'

describe('超时重试机制核心测试', () => {
  beforeEach(() => {
    // Clear any existing operations before each test
    aiTimeoutRetryManager.clearAllOperations()
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up after each test
    aiTimeoutRetryManager.clearAllOperations()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    aiTimeoutRetryManager.cancelAllOperations()
  })

  afterEach(() => {
    aiTimeoutRetryManager.cancelAllOperations()
  })

  describe('基本超时功能', () => {
    it('应该在超时时间内完成成功的操作', async () => {
      const successOperation = (signal: AbortSignal) => {
        return Promise.resolve('success')
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        successOperation,
        {
          customConfig: { 
            timeout: 1000,
            maxRetries: 0
          }
        }
      )

      expect(result.success).toBe(true)
      expect(result.data).toBe('success')
      expect(result.attempts).toBe(1)
    })

    it('应该在操作超时时失败', async () => {
      const slowOperation = (signal: AbortSignal) => 
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('too late'), 2000)
        })

      const startTime = Date.now()
      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        slowOperation,
        {
          customConfig: { 
            timeout: 500,
            maxRetries: 0
          }
        }
      )
      const endTime = Date.now()

      expect(result.success).toBe(false)
      expect(endTime - startTime).toBeGreaterThanOrEqual(450)
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })

  describe('重试机制', () => {
    it('应该在失败时进行重试', async () => {
      let attemptCount = 0
      
      const eventuallySuccessfulOperation = (signal: AbortSignal) => {
        attemptCount++
        if (attemptCount < 3) {
          return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
        }
        return Promise.resolve(`Success on attempt ${attemptCount}`)
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        eventuallySuccessfulOperation,
        {
          customConfig: { 
            maxRetries: 5,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(3)
      expect(result.data).toBe('Success on attempt 3')
      expect(attemptCount).toBe(3)
    })

    it('应该在达到最大重试次数后停止', async () => {
      let attemptCount = 0
      
      const alwaysFailingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
      }

      const maxRetries = 2
      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        alwaysFailingOperation,
        {
          customConfig: { 
            maxRetries,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(false)
      expect(attemptCount).toBe(maxRetries + 1) // 初始尝试 + 重试次数
    })
  })

  describe('配置管理', () => {
    it('应该为不同操作类型提供不同的配置', () => {
      const operationTypes: AIOperationType[] = ['library-load', 'model-load', 'inference', 'tts-load', 'cache-operation']
      
      const configs = operationTypes.map(type => 
        aiTimeoutRetryManager.getRecommendedConfig(type, 'good')
      )

      // 验证每个配置都有合理的值
      configs.forEach((config, index) => {
        expect(config.timeout).toBeGreaterThan(0)
        expect(config.maxRetries).toBeGreaterThanOrEqual(0)
        expect(config.baseDelay).toBeGreaterThan(0)
        expect(config.maxDelay).toBeGreaterThan(config.baseDelay)
      })

      // 模型加载应该有更长的超时时间
      const modelLoadConfig = configs[1] // model-load
      const cacheConfig = configs[4] // cache-operation
      expect(modelLoadConfig.timeout).toBeGreaterThan(cacheConfig.timeout)
    })

    it('应该根据网络质量调整配置', () => {
      const operationType: AIOperationType = 'library-load'
      
      const excellentConfig = aiTimeoutRetryManager.getRecommendedConfig(operationType, 'excellent')
      const poorConfig = aiTimeoutRetryManager.getRecommendedConfig(operationType, 'poor')
      
      // 网络质量差时应该有更长的超时时间和更多重试
      expect(poorConfig.timeout).toBeGreaterThan(excellentConfig.timeout)
      expect(poorConfig.maxRetries).toBeGreaterThanOrEqual(excellentConfig.maxRetries)
    })
  })

  describe('操作取消', () => {
    it('应该能够取消正在进行的操作', async () => {
      const operationId = 'test-cancel'
      
      const longOperation = (signal: AbortSignal) => 
        new Promise<string>((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve('completed'), 5000) // Longer operation
          
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId)
            reject(new Error('Operation cancelled'))
          })
        })

      // 启动操作
      const operationPromise = aiTimeoutRetryManager.executeWithTimeoutRetry(
        longOperation,
        {
          operationId,
          customConfig: { timeout: 10000, maxRetries: 0 } // Longer timeout
        }
      )

      // 等待操作开始 (shorter wait)
      await new Promise(resolve => setTimeout(resolve, 50))

      // 取消操作
      const cancelled = aiTimeoutRetryManager.cancelOperation(operationId)
      expect(cancelled).toBe(true)

      // 等待操作完成
      const result = await operationPromise
      expect(result.success).toBe(false)
    })

    it('应该正确跟踪活动操作数量', async () => {
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
      
      const longOperation = (signal: AbortSignal) => 
        new Promise<string>(resolve => setTimeout(() => resolve('done'), 500))

      const operations = []
      for (let i = 0; i < 3; i++) {
        operations.push(
          aiTimeoutRetryManager.executeWithTimeoutRetry(
            longOperation,
            {
              operationId: `test-${i}`,
              customConfig: { timeout: 1000, maxRetries: 0 }
            }
          )
        )
      }

      // 等待操作开始
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(3)

      // 等待操作完成
      await Promise.all(operations)
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
    })
  })

  describe('工具函数', () => {
    it('calculateBackoffDelay应该产生递增的延迟', () => {
      const baseDelay = 100
      const maxDelay = 5000
      const backoffMultiplier = 2
      const jitterFactor = 0.1
      
      const delays = []
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay, backoffMultiplier, jitterFactor)
        delays.push(delay)
      }
      
      // 验证延迟递增（考虑抖动）
      expect(delays[1]).toBeGreaterThan(delays[0] * 0.8) // 允许抖动
      expect(delays[2]).toBeGreaterThan(delays[1] * 0.8)
      
      // 验证不超过最大延迟
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(maxDelay * 1.2) // 允许抖动
      })
    })

    it('isRetryableError应该正确识别可重试的错误', () => {
      const retryableErrors = [
        new Error('Network timeout'),
        new Error('Connection failed'),
        new Error('Fetch error')
      ]

      const nonRetryableErrors = [
        new Error('Invalid argument'),
        new Error('Permission denied')
      ]

      retryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true)
      })

      nonRetryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false)
      })
    })

    it('createTimeoutPromise应该正确处理超时', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('success'), 1000))
      
      const startTime = Date.now()
      
      try {
        await createTimeoutPromise(slowPromise, 200)
        expect.fail('Should have timed out')
      } catch (error) {
        const endTime = Date.now()
        expect(error.message).toContain('timed out')
        expect(endTime - startTime).toBeGreaterThanOrEqual(150)
        expect(endTime - startTime).toBeLessThan(500)
      }
    })

    it('createTimeoutPromise应该在Promise完成时正常返回', async () => {
      const fastPromise = Promise.resolve('success')
      
      const result = await createTimeoutPromise(fastPromise, 1000)
      expect(result).toBe('success')
    })
  })

  describe('降级策略', () => {
    it('应该为不同操作提供降级建议', () => {
      const operationTypes: AIOperationType[] = ['library-load', 'model-load', 'inference', 'tts-load', 'cache-operation']
      
      operationTypes.forEach(operationType => {
        const shouldDegrade = aiTimeoutRetryManager.shouldDegrade(operationType)
        const suggestion = aiTimeoutRetryManager.getDegradationSuggestion(operationType)
        
        expect(typeof shouldDegrade).toBe('boolean')
        expect(typeof suggestion).toBe('string')
        expect(suggestion.length).toBeGreaterThan(0)
      })
    })
  })

  describe('边界条件', () => {
    it('应该处理零重试配置', async () => {
      let attemptCount = 0
      
      const failingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error('Always fails'))
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 0,
            timeout: 1000
          }
        }
      )

      expect(result.success).toBe(false)
      expect(attemptCount).toBe(1) // 只有初始尝试
    })

    it('应该处理同步错误', async () => {
      const throwingOperation = (signal: AbortSignal) => {
        throw new Error('Synchronous error')
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        throwingOperation,
        {
          customConfig: { 
            maxRetries: 1,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Synchronous error')
    })
  })
})